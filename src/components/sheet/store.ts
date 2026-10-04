"use client";

import { produce, type Draft } from "immer";
import { createContext, use } from "react";
import { toast } from "sonner";
import { createStore, useStore, type StoreApi } from "zustand";
import type { CharacterEventInput } from "@/lib/events";
import type { Sheet } from "@/lib/rules/compute";
import type { RollResult } from "@/lib/rules/formula";
import { CharacterDocSchema } from "@/lib/rules/schema";
import { rebaseDoc } from "@/lib/rules/merge";
import type { CharacterDoc } from "@/lib/rules/schema";
import type { LibrarySpell } from "@/lib/spells";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export type RollEntry = {
  id: string;
  label: string;
  detail?: string;
  result: RollResult;
  mode: "normal" | "adv" | "dis";
  /** Natural d20 result for checks, attacks and saves. */
  natural?: number;
  at: number;
};

type HistoryEntry = { doc: CharacterDoc; events: CharacterEventInput[]; label: string };

type SheetData = {
  id: string;
  /** View-only sheet (the GM looking at a player's character): changes are ignored. */
  readOnly: boolean;
  /** Campaign the viewer came from when the sheet is read-only. */
  campaignId: string | null;
  doc: CharacterDoc;
  /** Last document known to be on the server; the base of a three-way merge. */
  base: CharacterDoc;
  version: number;
  /** Journal entries that are not saved yet. */
  pending: CharacterEventInput[];
  dirty: boolean;
  status: SaveStatus;
  error: string | null;
  savedAt: number | null;
  /** Incremented to ask the autosave loop to run. */
  saveNonce: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  library: Record<string, LibrarySpell>;
  /** Library ids that were requested but do not exist (deleted or not visible). */
  missingSpells: string[];
  rolls: RollEntry[];
};

type SheetActions = {
  /** Apply a change to the document, optionally with journal entries. */
  change: (recipe: (d: Draft<CharacterDoc>) => void, events?: CharacterEventInput | CharacterEventInput[]) => void;
  /** Journal entry without a document change. */
  log: (event: CharacterEventInput) => void;
  undo: () => void;
  redo: () => void;
  replace: (doc: CharacterDoc, version: number) => void;
  /** A newer server version arrived (a GM change): replay unsaved edits on top of it. */
  rebase: (remote: CharacterDoc, version: number) => void;
  /** The server accepted `doc` as `version`. */
  saved: (doc: CharacterDoc, version: number) => void;
  requestSave: () => void;
  addLibrary: (spells: LibrarySpell[], missing?: string[]) => void;
  pushRoll: (roll: RollEntry) => void;
  clearRolls: () => void;
};

export type SheetStore = StoreApi<SheetData & SheetActions>;

const HISTORY_LIMIT = 100;

export function makeEvent(kind: string, summary: string, reason = "", data?: unknown): CharacterEventInput {
  return { kind, summary: summary.slice(0, 2000), reason: reason.slice(0, 1000), data, at: new Date().toISOString() };
}

const asList = (e?: CharacterEventInput | CharacterEventInput[]) => (e ? (Array.isArray(e) ? e : [e]) : []);

let lastReadOnlyWarning = 0;

function warnReadOnly() {
  const now = Date.now();
  if (now - lastReadOnlyWarning < 3000) return;
  lastReadOnlyWarning = now;
  toast.info("Это просмотр: лист меняет только игрок");
}

export function createSheetStore(init: { id: string; doc: CharacterDoc; version: number; readOnly?: boolean; campaignId?: string | null }): SheetStore {
  const readOnly = init.readOnly ?? false;
  /** True (with a warning) when the sheet must not change. */
  const blocked = () => {
    if (readOnly) warnReadOnly();
    return readOnly;
  };
  return createStore<SheetData & SheetActions>()((set, get) => {
    const markDirty = (s: SheetData) => ({
      dirty: true,
      status: (s.status === "saving" || s.status === "conflict" ? s.status : "dirty") as SaveStatus,
    });
    return {
      id: init.id,
      readOnly,
      campaignId: init.campaignId ?? null,
      doc: init.doc,
      base: init.doc,
      version: init.version,
      pending: [],
      dirty: false,
      status: "saved",
      error: null,
      savedAt: null,
      saveNonce: 0,
      past: [],
      future: [],
      library: {},
      missingSpells: [],
      rolls: [],

      change(recipe, events) {
        if (blocked()) return;
        const s = get();
        const next = produce(s.doc, recipe);
        const evs = asList(events);
        if (next === s.doc && !evs.length) return;
        set({
          doc: next,
          pending: evs.length ? [...s.pending, ...evs] : s.pending,
          ...markDirty(s),
          past: next === s.doc ? s.past : [...s.past.slice(-HISTORY_LIMIT + 1), { doc: s.doc, events: evs, label: evs[0]?.summary ?? "" }],
          future: next === s.doc ? s.future : [],
        });
      },

      log(event) {
        if (blocked()) return;
        const s = get();
        set({ pending: [...s.pending, event], ...markDirty(s) });
      },

      undo() {
        if (blocked()) return;
        const s = get();
        const entry = s.past[s.past.length - 1];
        if (!entry) return;
        let pending = s.pending;
        const unsaved = entry.events.length > 0 && entry.events.every((e) => s.pending.includes(e));
        if (unsaved) pending = pending.filter((e) => !entry.events.includes(e));
        else if (entry.label) pending = [...pending, makeEvent("edit", `Отменено: ${entry.label}`)];
        set({
          doc: entry.doc,
          pending,
          past: s.past.slice(0, -1),
          future: [{ doc: s.doc, events: entry.events, label: entry.label }, ...s.future].slice(0, HISTORY_LIMIT),
          ...markDirty(s),
        });
      },

      redo() {
        if (blocked()) return;
        const s = get();
        const entry = s.future[0];
        if (!entry) return;
        const again = entry.events.map((e) => ({ ...e, at: new Date().toISOString() }));
        set({
          doc: entry.doc,
          pending: [...s.pending, ...again],
          past: [...s.past, { doc: s.doc, events: again, label: entry.label }],
          future: s.future.slice(1),
          ...markDirty(s),
        });
      },

      replace(doc, version) {
        set({ doc, base: doc, version, pending: [], dirty: false, status: "saved", error: null, past: [], future: [] });
      },

      rebase(remote, version) {
        const s = get();
        if (!s.dirty) {
          set({ doc: remote, base: remote, version, status: "saved", error: null, past: [], future: [] });
          return;
        }
        const merged = CharacterDocSchema.safeParse(rebaseDoc(s.base, s.doc, remote));
        // History points at documents without the remote change; undo would revert it.
        set({ doc: merged.success ? merged.data : remote, base: remote, version, past: [], future: [], status: "dirty", error: null });
      },

      saved(doc, version) {
        set({ base: doc, version });
      },

      requestSave() {
        set((s) => ({ saveNonce: s.saveNonce + 1 }));
      },

      addLibrary(spells, missing = []) {
        set((s) => {
          const library = { ...s.library };
          for (const sp of spells) library[sp.id] = sp;
          return { library, missingSpells: [...new Set([...s.missingSpells, ...missing])] };
        });
      },

      pushRoll(roll) {
        set((s) => ({ rolls: [roll, ...s.rolls].slice(0, 60) }));
      },

      clearRolls() {
        set({ rolls: [] });
      },
    };
  });
}

export const SheetStoreContext = createContext<SheetStore | null>(null);
export const ComputedContext = createContext<Sheet | null>(null);

function useStoreApi(): SheetStore {
  const store = use(SheetStoreContext);
  if (!store) throw new Error("Sheet store is missing");
  return store;
}

export function useSheet<T>(selector: (s: SheetData & SheetActions) => T): T {
  return useStore(useStoreApi(), selector);
}

export function useSheetApi(): SheetStore {
  return useStoreApi();
}

export const useDoc = () => useSheet((s) => s.doc);
export const useChange = () => useSheet((s) => s.change);

export function useComputed(): Sheet {
  const sheet = use(ComputedContext);
  if (!sheet) throw new Error("Computed sheet is missing");
  return sheet;
}

/** Computed sheet when rendered inside a sheet, null elsewhere (e.g. the spell library). */
export function useMaybeComputed(): Sheet | null {
  return use(ComputedContext);
}
