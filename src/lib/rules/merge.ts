// Three-way merge of JSON documents. Used when a save hits a version
// conflict because the GM changed the sheet (a grant, damage) while the player
// was editing: the player's unsaved changes are replayed on top of the server
// version instead of being thrown away.
//
// Rules: a value changed only on one side takes that side; changed on both
// sides, the local (player's) value wins. Arrays of objects with an `id` merge
// entry by entry, so the GM adding an item and the player editing another one
// both survive.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isObject(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hasIds(list: unknown): list is { id: string }[] {
  return Array.isArray(list) && list.every((x) => isObject(x) && typeof x.id === "string");
}

function mergeById(base: { id: string }[], local: { id: string }[], remote: { id: string }[]): Json[] {
  const baseById = new Map(base.map((x) => [x.id, x]));
  const localById = new Map(local.map((x) => [x.id, x]));
  const remoteById = new Map(remote.map((x) => [x.id, x]));
  const out: Json[] = [];
  // Remote order first: it is the newest saved state.
  for (const r of remote) {
    const b = baseById.get(r.id);
    const l = localById.get(r.id);
    if (b && !l) {
      // Deleted locally; keep only if the remote side changed it meanwhile.
      if (!equal(b, r)) out.push(r as unknown as Json);
      continue;
    }
    if (!l) {
      out.push(r as unknown as Json);
      continue;
    }
    out.push(merge(b ?? null, l as unknown as Json, r as unknown as Json));
  }
  // Entries added locally.
  for (const l of local) {
    if (remoteById.has(l.id)) continue;
    if (baseById.has(l.id)) continue; // deleted on the server
    out.push(l as unknown as Json);
  }
  return out;
}

export function merge(base: Json, local: Json, remote: Json): Json {
  if (equal(local, base)) return remote;
  if (equal(remote, base)) return local;
  if (isObject(base) && isObject(local) && isObject(remote)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    const out: Record<string, Json> = {};
    for (const k of keys) {
      const value = merge(base[k] ?? null, local[k] ?? null, remote[k] ?? null);
      if (value !== null || k in local || k in remote) out[k] = value;
    }
    return out;
  }
  if (hasIds(base) && hasIds(local) && hasIds(remote)) return mergeById(base, local, remote);
  return local;
}

/** Typed wrapper: replays local changes (base → local) on top of remote. */
export function rebaseDoc<T>(base: T, local: T, remote: T): T {
  return merge(base as unknown as Json, local as unknown as Json, remote as unknown as Json) as unknown as T;
}
