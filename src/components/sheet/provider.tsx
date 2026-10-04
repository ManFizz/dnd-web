"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { computeSheet } from "@/lib/rules/compute";
import type { CharacterDoc } from "@/lib/rules/schema";
import type { LibrarySpell } from "@/lib/spells";
import { ComputedContext, createSheetStore, SheetStoreContext, type SheetStore } from "./store";

export function SheetProvider({
  initial,
  children,
}: {
  initial: { id: string; doc: CharacterDoc; version: number };
  children: React.ReactNode;
}) {
  const [store] = useState(() => createSheetStore(initial));
  useAutosave(store);
  useSpellLibrary(store);
  useUndoShortcuts(store);
  const doc = useStore(store, (s) => s.doc);
  const computed = useMemo(() => computeSheet(doc), [doc]);
  return (
    <SheetStoreContext value={store}>
      <ComputedContext value={computed}>{children}</ComputedContext>
    </SheetStoreContext>
  );
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

/** Debounced autosave with optimistic concurrency (version check on the server). */
function useAutosave(store: SheetStore) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let running = false;

    const schedule = (ms = 700) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    const run = async () => {
      timer = null;
      const s = store.getState();
      if (running || !s.dirty || s.status === "conflict") return;
      running = true;
      const doc = s.doc;
      const events = s.pending;
      store.setState({ status: "saving" });
      try {
        const res = await fetch(`/api/characters/${s.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseVersion: s.version, doc, events }),
        });
        if (res.status === 409) {
          store.setState({ status: "conflict", error: "Персонаж изменён в другом окне или на другом устройстве." });
          return;
        }
        if (!res.ok) throw new Error(await errorMessage(res));
        const { version } = (await res.json()) as { version: number };
        const sent = new Set(events);
        const cur = store.getState();
        const pending = cur.pending.filter((e) => !sent.has(e));
        const still = cur.doc !== doc || pending.length > 0;
        failures = 0;
        store.setState({ version, pending, dirty: still, status: still ? "dirty" : "saved", savedAt: Date.now(), error: null });
        if (still) schedule(300);
      } catch (e) {
        failures++;
        store.setState({ status: "error", error: e instanceof Error ? e.message : "Нет связи с сервером" });
        schedule(Math.min(30_000, 2_000 * 2 ** (failures - 1)));
      } finally {
        running = false;
      }
    };

    const unsubscribe = store.subscribe((s, prev) => {
      if (s.saveNonce !== prev.saveNonce) schedule(0);
      else if ((s.doc !== prev.doc || s.pending !== prev.pending) && s.dirty && s.status !== "conflict") schedule();
    });

    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (store.getState().dirty) e.preventDefault();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden" && store.getState().dirty) void run();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [store]);
}

/** Loads library spells referenced by the character. */
function useSpellLibrary(store: SheetStore) {
  const spells = useStore(store, (s) => s.doc.spellcasting.spells);
  useEffect(() => {
    const { library, missingSpells } = store.getState();
    const ids = [...new Set(spells.map((s) => s.spellId).filter((id): id is string => !!id))].filter(
      (id) => !library[id] && !missingSpells.includes(id),
    );
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const res = await fetch(`/api/spells?ids=${encodeURIComponent(chunk.join(","))}`);
        if (!res.ok || cancelled) return;
        const { spells: found } = (await res.json()) as { spells: LibrarySpell[] };
        const foundIds = new Set(found.map((s) => s.id));
        store.getState().addLibrary(
          found,
          chunk.filter((id) => !foundIds.has(id)),
        );
      }
    })().catch(() => {
      // The list shows cached names; a later change retries the request.
    });
    return () => {
      cancelled = true;
    };
  }, [spells, store]);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function useUndoShortcuts(store: SheetStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      // "я" is the Cyrillic key in the place of "z".
      if ((key === "z" || key === "я") && !e.shiftKey) {
        e.preventDefault();
        store.getState().undo();
      } else if (((key === "z" || key === "я") && e.shiftKey) || key === "y" || key === "н") {
        e.preventDefault();
        store.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}
