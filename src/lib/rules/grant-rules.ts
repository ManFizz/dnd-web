import { newId } from "./ids";
import type { CharacterDoc, Counter, Feature, GrantMark, Item } from "./schema";

// How GM grants live inside a character document: creating the copy, putting
// it into the sheet, finding it again, and checking a player's save against the
// grant's lock. Pure functions, used by the server and covered by unit tests.

export type GrantKind = "item" | "feature" | "counter";
export type GrantEntry = Item | Feature | Counter;
type Stage = { name: string; effects: Feature["effects"] };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const PREFIX: Record<GrantKind, string> = { item: "it", feature: "ft", counter: "ct" };

/** A fresh copy of a template object, marked with the grant. */
export function instantiate(
  kind: GrantKind,
  body: GrantEntry,
  mark: GrantMark,
  opts: { bodyPart?: string; quantity?: number; stages?: Stage[] } = {},
): GrantEntry {
  const entry = clone(body) as GrantEntry;
  entry.id = newId(PREFIX[kind]);
  entry.grant = clone(mark);
  if (kind === "item" && opts.quantity !== undefined) (entry as Item).quantity = opts.quantity;
  if (kind === "feature") {
    const f = entry as Feature;
    if (opts.bodyPart) f.bodyPart = opts.bodyPart;
    const stage = opts.stages?.[mark.stage];
    if (stage) f.effects = clone(stage.effects);
  }
  return entry;
}

function listOf(doc: CharacterDoc, kind: GrantKind): GrantEntry[] {
  return kind === "item" ? doc.items : kind === "feature" ? doc.features : doc.counters;
}

/** Every granted entry in the document, by grant id. */
export function grantedEntries(doc: CharacterDoc): Map<string, { kind: GrantKind; entry: GrantEntry }> {
  const out = new Map<string, { kind: GrantKind; entry: GrantEntry }>();
  for (const kind of ["item", "feature", "counter"] as const) {
    for (const entry of listOf(doc, kind)) if (entry.grant) out.set(entry.grant.id, { kind, entry });
  }
  return out;
}

/**
 * Adds a granted copy. A mutation on a body part replaces whatever mutation
 * was there (rules of Vladimir's GM). Returns the removed entries.
 */
export function insertEntry(doc: CharacterDoc, kind: GrantKind, entry: GrantEntry): GrantEntry[] {
  const replaced: GrantEntry[] = [];
  if (kind === "feature") {
    const f = entry as Feature;
    if (f.kind === "mutation" && f.bodyPart) {
      doc.features = doc.features.filter((x) => {
        const same = x.kind === "mutation" && x.bodyPart === f.bodyPart;
        if (same) replaced.push(x);
        return !same;
      });
    }
    doc.features.push(f);
  } else if (kind === "item") doc.items.push(entry as Item);
  else doc.counters.push(entry as Counter);
  return replaced;
}

export function removeEntry(doc: CharacterDoc, grantId: string): GrantEntry | null {
  let removed: GrantEntry | null = null;
  const keep = <T extends GrantEntry>(list: T[]) =>
    list.filter((x) => {
      if (x.grant?.id !== grantId) return true;
      removed = x;
      return false;
    });
  doc.items = keep(doc.items);
  doc.features = keep(doc.features);
  doc.counters = keep(doc.counters);
  return removed;
}

export function findEntry(doc: CharacterDoc, grantId: string): GrantEntry | null {
  return grantedEntries(doc).get(grantId)?.entry ?? null;
}

/** Drops the grant marks of one campaign: the entries become the player's own. */
export function stripMarks(doc: CharacterDoc, campaignId: string): number {
  let n = 0;
  for (const kind of ["item", "feature", "counter"] as const) {
    for (const entry of listOf(doc, kind)) {
      if (entry.grant && entry.grant.campaignId === campaignId) {
        entry.grant = null;
        n++;
      }
    }
  }
  return n;
}

/**
 * Replaces the content of a granted copy with a new version of its template,
 * keeping what the player tracks at the table (quantity, equipped, uses...).
 */
export function refreshEntry(kind: GrantKind, current: GrantEntry, body: GrantEntry, stages: Stage[]): GrantEntry {
  const next = clone(body) as GrantEntry;
  next.id = current.id;
  next.grant = current.grant;
  if (kind === "item") {
    const cur = current as Item;
    const n = next as Item;
    n.quantity = cur.quantity;
    n.equipped = cur.equipped;
    n.attuned = cur.attuned;
    if (n.charges && cur.charges) n.charges.used = cur.charges.used;
  } else if (kind === "feature") {
    const cur = current as Feature;
    const n = next as Feature;
    n.active = cur.active;
    n.bodyPart = cur.bodyPart || n.bodyPart;
    if (n.uses && cur.uses) n.uses.used = cur.uses.used;
    const stage = cur.grant ? stages[cur.grant.stage] : undefined;
    if (stage) n.effects = clone(stage.effects);
  } else {
    (next as Counter).value = (current as Counter).value;
  }
  return next;
}

// ------------------------------------------------------------------ player saves

/** Content the player may not touch on a locked grant (everything but table state). */
function lockedContent(kind: GrantKind, entry: GrantEntry): string {
  const copy = clone(entry) as Record<string, unknown>;
  delete copy.grant;
  if (kind === "item") {
    delete copy.quantity;
    delete copy.equipped;
    delete copy.attuned;
    if (copy.charges) (copy.charges as { used?: number }).used = 0;
  } else if (kind === "feature") {
    if (copy.uses) (copy.uses as { used?: number }).used = 0;
    delete copy.active;
  } else {
    delete copy.value;
  }
  return JSON.stringify(copy);
}

const EXPIRING = new Set(["short", "long", "days"]);

export class GrantRuleError extends Error {}

export type SaveCheck = {
  /** Grants whose copy the player removed (allowed: no lock, or it expired on a rest). */
  removed: string[];
  /** Messages for the GM, e.g. a cursed item was put on. */
  notices: string[];
};

/**
 * Checks a player's save against the grants in the previous version and fixes
 * up the new document in place: grant marks always come from the server copy,
 * forged marks are dropped. Throws GrantRuleError when a lock is broken.
 */
export function checkPlayerSave(prev: CharacterDoc, next: CharacterDoc, characterName = "Персонаж"): SaveCheck {
  const before = grantedEntries(prev);
  const result: SaveCheck = { removed: [], notices: [] };

  for (const kind of ["item", "feature", "counter"] as const) {
    for (const entry of listOf(next, kind)) {
      if (!entry.grant) continue;
      const old = before.get(entry.grant.id);
      if (!old || old.kind !== kind) {
        entry.grant = null;
        continue;
      }
      const mark = old.entry.grant!;
      // Rests count down "days"; everything else in the mark is the GM's.
      const left = mark.expires === "days" ? Math.min(mark.left, entry.grant.left) : mark.left;
      entry.grant = { ...mark, left };
    }
  }

  const after = grantedEntries(next);
  for (const [id, { kind, entry: old }] of before) {
    const mark = old.grant!;
    const cur = after.get(id);
    if (!cur) {
      if (mark.lock === "noremove" && !EXPIRING.has(mark.expires)) throw new GrantRuleError(`«${old.name}» нельзя убрать: так решил ГМ`);
      result.removed.push(id);
      continue;
    }
    const restricted = mark.lock !== "none" || mark.visibility !== "visible";
    if (restricted && lockedContent(kind, cur.entry) !== lockedContent(kind, old)) {
      throw new GrantRuleError(`«${old.name}» нельзя менять: так решил ГМ`);
    }
    if (kind === "feature" && mark.lock === "noremove" && (old as Feature).active && !(cur.entry as Feature).active) {
      throw new GrantRuleError(`«${old.name}» нельзя отключить: так решил ГМ`);
    }
    if (kind === "item" && mark.cursed) {
      const o = old as Item;
      const n = cur.entry as Item;
      const wasOn = o.attunement ? o.attuned : o.equipped;
      const isOn = n.attunement ? n.attuned : n.equipped;
      if (wasOn && !isOn) throw new GrantRuleError(`«${old.name}» проклят: снять его нельзя`);
      if (!wasOn && isOn) result.notices.push(`${characterName} ${o.attunement ? "настроился на" : "надел"} проклятый предмет «${old.name}»`);
    }
  }
  return result;
}

/** Applies the grant timers of a rest: removes "until rest" grants and counts down days. */
export function expireOnRest(doc: CharacterDoc, kind: "short" | "long"): string[] {
  const changes: string[] = [];
  const keep = <T extends GrantEntry>(list: T[]) =>
    list.filter((x) => {
      const g = x.grant;
      if (!g) return true;
      if (g.expires === "short" || (g.expires === "long" && kind === "long")) {
        changes.push(`Закончилось: «${x.name}»`);
        return false;
      }
      if (g.expires === "days" && kind === "long") {
        g.left = Math.max(0, g.left - 1);
        if (g.left === 0) {
          changes.push(`Закончилось: «${x.name}»`);
          return false;
        }
        changes.push(`«${x.name}»: осталось дней ${g.left}`);
      }
      return true;
    });
  doc.items = keep(doc.items);
  doc.features = keep(doc.features);
  doc.counters = keep(doc.counters);
  return changes;
}

/** Counts down "rounds" grants by one round; returns names that ended. */
export function expireOnRound(doc: CharacterDoc): string[] {
  const ended: string[] = [];
  const keep = <T extends GrantEntry>(list: T[]) =>
    list.filter((x) => {
      const g = x.grant;
      if (!g || g.expires !== "rounds") return true;
      g.left = Math.max(0, g.left - 1);
      if (g.left > 0) return true;
      ended.push(x.name);
      return false;
    });
  doc.items = keep(doc.items);
  doc.features = keep(doc.features);
  doc.counters = keep(doc.counters);
  return ended;
}

/** Removes "until the end of the session" grants; returns their names. */
export function expireOnSessionEnd(doc: CharacterDoc): string[] {
  const ended: string[] = [];
  const keep = <T extends GrantEntry>(list: T[]) =>
    list.filter((x) => {
      if (x.grant?.expires !== "session") return true;
      ended.push(x.name);
      return false;
    });
  doc.items = keep(doc.items);
  doc.features = keep(doc.features);
  doc.counters = keep(doc.counters);
  return ended;
}
