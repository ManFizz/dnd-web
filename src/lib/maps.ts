import { z } from "zod";

// Maps: an image with a grid, fog of war, pins (places, notes, links to nested
// maps) and tokens (characters, monsters). Coordinates are image pixels.

export const MAP_KINDS = ["world", "place", "combat"] as const;
export type MapKind = (typeof MAP_KINDS)[number];
export const MAP_KIND_LABELS: Record<MapKind, string> = { world: "Мир", place: "Место", combat: "Бой" };

export const GridSchema = z.object({
  show: z.boolean().default(false),
  /** Cell size in image pixels. */
  size: z.number().min(4).max(1000).default(70),
  offsetX: z.number().min(-1000).max(1000).default(0),
  offsetY: z.number().min(-1000).max(1000).default(0),
  /** Feet per cell, for distances. */
  feet: z.number().min(0).max(5280).default(5),
});
export type MapGrid = z.infer<typeof GridSchema>;

export const FogOpSchema = z.object({
  op: z.enum(["reveal", "hide"]),
  x: z.number(),
  y: z.number(),
  w: z.number().min(0),
  h: z.number().min(0),
});
export type FogOp = z.infer<typeof FogOpSchema>;

export const FogSchema = z.object({
  enabled: z.boolean().default(false),
  ops: z.array(FogOpSchema).max(2000).default([]),
});
export type MapFog = z.infer<typeof FogSchema>;

export const PIN_COLORS = ["accent", "danger", "good", "info", "magic"] as const;

export const PinSchema = z.object({
  id: z.string().min(1).max(40),
  x: z.number(),
  y: z.number(),
  label: z.string().max(200).default(""),
  note: z.string().max(5000).default(""),
  color: z.enum(PIN_COLORS).default("accent"),
  /** Only the GM sees it. */
  hidden: z.boolean().default(false),
  /** Opens a nested map (a city on the world map, a dungeon in the city). */
  mapId: z.string().max(80).nullable().default(null),
});
export type MapPin = z.infer<typeof PinSchema>;

export const TOKEN_COLORS = ["#d4a63a", "#c2410c", "#16a34a", "#2563eb", "#9333ea", "#475569", "#e11d48", "#0891b2"] as const;

export const TokenSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["pc", "monster", "npc"]).default("npc"),
  characterId: z.string().max(80).nullable().default(null),
  creatureId: z.string().max(80).nullable().default(null),
  name: z.string().max(200),
  x: z.number(),
  y: z.number(),
  /** Diameter in grid cells (medium = 1, large = 2…). */
  size: z.number().min(0.25).max(10).default(1),
  color: z.string().max(20).default("#475569"),
  hidden: z.boolean().default(false),
});
export type MapToken = z.infer<typeof TokenSchema>;

export const MapInputSchema = z.object({
  name: z.string().trim().min(1, "Нужно название").max(200),
  kind: z.enum(MAP_KINDS).default("place"),
  parentId: z.string().max(80).nullable().default(null),
  imageId: z.string().max(80).nullable().default(null),
  width: z.number().int().min(0).max(30000).default(0),
  height: z.number().int().min(0).max(30000).default(0),
  revealed: z.boolean().default(false),
  grid: GridSchema.prefault({}),
  fog: FogSchema.prefault({}),
  pins: z.array(PinSchema).max(500).default([]),
  order: z.number().int().default(0),
});
export type MapInput = z.infer<typeof MapInputSchema>;

export type MapRow = Omit<MapInput, "pins"> & {
  id: string;
  pins: MapPin[];
  tokens: MapToken[];
  /** Changes whenever the fog does: players' image URLs carry it. */
  fogKey: string;
  updatedAt: string;
};

export const MapActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), tokenId: z.string().max(40), x: z.number(), y: z.number() }),
  z.object({ action: z.literal("addTokens"), tokens: z.array(TokenSchema).min(1).max(50) }),
  z.object({ action: z.literal("updateToken"), token: TokenSchema }),
  z.object({ action: z.literal("removeToken"), tokenId: z.string().max(40) }),
  /** Tokens for every accepted party character not on the map yet. */
  z.object({ action: z.literal("addParty") }),
  /** Tokens for the combatants of an encounter. */
  z.object({ action: z.literal("addEncounter"), encounterId: z.string().max(80) }),
  z.object({ action: z.literal("fog"), op: FogOpSchema }),
  z.object({ action: z.literal("fogAll"), reveal: z.boolean() }),
  z.object({ action: z.literal("undoFog") }),
  z.object({ action: z.literal("pin"), pin: PinSchema }),
  z.object({ action: z.literal("removePin"), pinId: z.string().max(40) }),
]);
export type MapAction = z.infer<typeof MapActionSchema>;

/** Whether a point is under the fog: the last operation covering it decides. */
export function fogged(fog: MapFog, x: number, y: number): boolean {
  if (!fog.enabled) return false;
  for (let i = fog.ops.length - 1; i >= 0; i--) {
    const o = fog.ops[i];
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o.op === "hide";
  }
  return true;
}

/** Normalises a dragged rectangle (any corner first) and clips it to the image. */
export function normRect(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number) {
  const x1 = Math.max(0, Math.min(a.x, b.x));
  const y1 = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(width || Infinity, Math.max(a.x, b.x));
  const y2 = Math.min(height || Infinity, Math.max(a.y, b.y));
  return { x: Math.round(x1), y: Math.round(y1), w: Math.max(0, Math.round(x2 - x1)), h: Math.max(0, Math.round(y2 - y1)) };
}

/** Token centre snapped to the grid: odd sizes to cell centres, even sizes to corners. */
export function snap(grid: MapGrid, x: number, y: number, size = 1): { x: number; y: number } {
  if (!grid.show) return { x: Math.round(x), y: Math.round(y) };
  const half = Math.round(size) % 2 === 1 ? grid.size / 2 : 0;
  const s = (v: number, off: number) => Math.round((v - off - half) / grid.size) * grid.size + off + half;
  return { x: s(x, grid.offsetX), y: s(y, grid.offsetY) };
}

/** Distance in feet between two points by the 5e grid rule (diagonal = 1 cell). */
export function gridDistance(grid: MapGrid, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = Math.abs(a.x - b.x) / grid.size;
  const dy = Math.abs(a.y - b.y) / grid.size;
  return Math.round(Math.max(dx, dy)) * grid.feet;
}

/** SVG of the fog for an image (white = fog), used for the mask on the client and the server. */
export function fogSvg(fog: MapFog, width: number, height: number, color = "#000"): string {
  const rects = fog.ops.map((o) => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.op === "reveal" ? "black" : "white"}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><mask id="f" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="white"/>${rects}</mask></defs>` +
    `<rect width="${width}" height="${height}" fill="${color}" mask="url(#f)"/></svg>`
  );
}

/** What players get: no hidden or fogged pins and tokens (their own tokens always show). */
export function playerMap(m: MapRow, ownCharacterIds: string[] = []): MapRow {
  const visible = (p: { x: number; y: number; hidden: boolean }) => !p.hidden && !fogged(m.fog, p.x, p.y);
  return {
    ...m,
    pins: m.pins.filter(visible),
    tokens: m.tokens.filter((t) => (t.characterId && ownCharacterIds.includes(t.characterId)) || visible(t)),
  };
}
