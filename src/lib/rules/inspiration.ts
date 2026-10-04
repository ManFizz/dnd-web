import { newId } from "./ids";
import type { CharacterDoc } from "./schema";

// Inspiration is a count plus optional notes on where each point came from.
// Points without a note (older saves, imports) count as the oldest ones.

type Combat = Pick<CharacterDoc["combat"], "inspiration" | "inspirationNotes">;
export type InspirationEntry = { id: string | null; reason: string; at: string };

function currentNotes(c: Combat) {
  return c.inspiration > 0 ? c.inspirationNotes.slice(-c.inspiration) : [];
}

/** One entry per point, oldest first. */
export function inspirationEntries(c: Combat): InspirationEntry[] {
  const notes = currentNotes(c);
  const blank = Math.max(0, c.inspiration - notes.length);
  return [...Array.from({ length: blank }, () => ({ id: null, reason: "", at: "" })), ...notes];
}

export function gainInspiration(c: Combat, reason: string, at = new Date().toISOString()): void {
  c.inspirationNotes = currentNotes(c);
  c.inspiration += 1;
  c.inspirationNotes.push({ id: newId("in"), reason, at });
}

/** Spends the given point, or the oldest one. Returns the entry that was spent. */
export function spendInspiration(c: Combat, id?: string | null): InspirationEntry | null {
  if (c.inspiration <= 0) return null;
  const entries = inspirationEntries(c);
  const notes = currentNotes(c);
  const target = (id && entries.find((e) => e.id === id)) || entries[0];
  c.inspirationNotes = target.id ? notes.filter((n) => n.id !== target.id) : notes;
  c.inspiration -= 1;
  return target;
}
