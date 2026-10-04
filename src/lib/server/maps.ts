import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { z } from "zod";
import { isGmRole } from "@/lib/campaigns";
import type { Size } from "@/lib/creatures";
import { CombatantSchema } from "@/lib/encounter";
import {
  FogSchema,
  fogSvg,
  GridSchema,
  MapActionSchema,
  MapInputSchema,
  PinSchema,
  playerMap,
  snap,
  TOKEN_COLORS,
  TokenSchema,
  type MapFog,
  type MapRow,
} from "@/lib/maps";
import type { Prisma } from "@/generated/prisma/client";
import { requireGm, requireMember } from "./campaigns";
import { prisma } from "./db";
import { HttpError } from "./http";
import { publish } from "./realtime";

// Maps with fog of war. Players never get what the fog covers: pins and
// tokens under it are filtered out and the image itself is blacked out on
// the server before it is sent.

const tid = () => `tk_${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`;

const SIZE_CELLS: Record<Size, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

function parseList<T>(schema: z.ZodType<T>, raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const p = schema.safeParse(x);
    return p.success ? [p.data] : [];
  });
}

const parseFog = (raw: unknown): MapFog => FogSchema.safeParse(raw ?? {}).data ?? { enabled: false, ops: [] };
const fogKey = (fog: MapFog) => createHash("sha1").update(JSON.stringify(fog)).digest("hex").slice(0, 12);

type MapDb = Prisma.CampaignMapGetPayload<object>;

function mapRow(m: MapDb): MapRow {
  const fog = parseFog(m.fog);
  return {
    id: m.id,
    name: m.name,
    kind: m.kind as MapRow["kind"],
    parentId: m.parentId,
    imageId: m.imageId,
    width: m.width,
    height: m.height,
    revealed: m.revealed,
    grid: GridSchema.safeParse(m.grid ?? {}).data ?? GridSchema.parse({}),
    fog,
    pins: parseList(PinSchema, m.pins),
    tokens: parseList(TokenSchema, m.tokens),
    order: m.order,
    fogKey: fogKey(fog),
    updatedAt: m.updatedAt.toISOString(),
  };
}

async function ownCharacters(campaignId: string, userId: string) {
  const rows = await prisma.campaignCharacter.findMany({ where: { campaignId, userId, status: "accepted" }, select: { characterId: true } });
  return rows.map((r) => r.characterId);
}

/** GMs get everything unless they ask for the players' view (the shared screen). */
export async function listMaps(campaignId: string, userId: string, asPlayer = false) {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role) && !asPlayer;
  const [rows, campaign] = await Promise.all([
    prisma.campaignMap.findMany({ where: { campaignId, ...(gm ? {} : { revealed: true }) }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { presentMapId: true } }),
  ]);
  const maps = rows.map(mapRow);
  if (gm) return { maps, presentMapId: campaign?.presentMapId ?? null, gm: true };
  const own = asPlayer ? [] : await ownCharacters(campaignId, userId);
  const present = campaign?.presentMapId && maps.some((m) => m.id === campaign.presentMapId) ? campaign.presentMapId : null;
  return { maps: maps.map((m) => playerMap(m, own)), presentMapId: present, gm: false };
}

/** Reads the image size so coordinates match the picture. */
async function imageSize(campaignId: string, imageId: string | null) {
  if (!imageId) return { width: 0, height: 0 };
  const f = await prisma.campaignFile.findFirst({ where: { id: imageId, campaignId } });
  if (!f) throw new HttpError(400, "Картинка не найдена");
  const meta = await sharp(f.data).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

async function checkParent(campaignId: string, mapId: string | null, parentId: string | null) {
  if (!parentId) return;
  // Walk up to make sure the map does not become its own ancestor.
  let cur: string | null = parentId;
  for (let depth = 0; cur && depth < 50; depth++) {
    if (cur === mapId) throw new HttpError(400, "Карта не может лежать внутри самой себя");
    const p: { parentId: string | null } | null = await prisma.campaignMap.findFirst({ where: { id: cur, campaignId }, select: { parentId: true } });
    if (!p) throw new HttpError(400, "Родительская карта не найдена");
    cur = p.parentId;
  }
}

export async function createMap(campaignId: string, userId: string, input: z.infer<typeof MapInputSchema>) {
  await requireGm(campaignId, userId);
  await checkParent(campaignId, null, input.parentId);
  const size = await imageSize(campaignId, input.imageId);
  const grid = input.kind === "combat" && !input.grid.show ? { ...input.grid, show: true } : input.grid;
  const row = await prisma.campaignMap.create({
    data: {
      campaignId,
      name: input.name,
      kind: input.kind,
      parentId: input.parentId,
      imageId: input.imageId,
      ...size,
      revealed: input.revealed,
      grid: grid as Prisma.InputJsonValue,
      fog: input.fog as Prisma.InputJsonValue,
      pins: input.pins as Prisma.InputJsonValue,
      order: input.order,
    },
  });
  await publish({ type: "scope", campaignId, scope: "maps" });
  return { id: row.id };
}

/** Saves the map settings; tokens and fog have their own actions. */
export async function updateMap(campaignId: string, mapId: string, userId: string, input: z.infer<typeof MapInputSchema>) {
  await requireGm(campaignId, userId);
  const prev = await prisma.campaignMap.findFirst({ where: { id: mapId, campaignId } });
  if (!prev) throw new HttpError(404, "Карта не найдена");
  await checkParent(campaignId, mapId, input.parentId);
  const size = input.imageId === prev.imageId ? { width: prev.width, height: prev.height } : await imageSize(campaignId, input.imageId);
  await prisma.campaignMap.update({
    where: { id: mapId },
    data: {
      name: input.name,
      kind: input.kind,
      parentId: input.parentId,
      imageId: input.imageId,
      ...size,
      revealed: input.revealed,
      grid: input.grid as Prisma.InputJsonValue,
      fog: input.fog as Prisma.InputJsonValue,
      pins: input.pins as Prisma.InputJsonValue,
      order: input.order,
    },
  });
  if (input.revealed && !prev.revealed) await publish({ type: "notice", campaignId, text: `Новая карта: ${input.name}`, gmOnly: false });
  await publish({ type: "scope", campaignId, scope: "maps" });
}

export async function deleteMap(campaignId: string, mapId: string, userId: string) {
  await requireGm(campaignId, userId);
  await prisma.$transaction([
    prisma.campaignMap.deleteMany({ where: { id: mapId, campaignId } }),
    prisma.campaign.updateMany({ where: { id: campaignId, presentMapId: mapId }, data: { presentMapId: null } }),
  ]);
  await publish({ type: "scope", campaignId, scope: "maps" });
}

/** The map on the shared screen; players are offered to follow it. */
export async function presentMap(campaignId: string, userId: string, mapId: string | null) {
  await requireGm(campaignId, userId);
  if (mapId) {
    const m = await prisma.campaignMap.findFirst({ where: { id: mapId, campaignId } });
    if (!m) throw new HttpError(404, "Карта не найдена");
    // Showing a map reveals it.
    if (!m.revealed) await prisma.campaignMap.update({ where: { id: mapId }, data: { revealed: true } });
    await publish({ type: "notice", campaignId, text: `ГМ показывает карту: ${m.name}`, gmOnly: false });
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { presentMapId: mapId } });
  await publish({ type: "scope", campaignId, scope: "maps" });
}

export async function mapAction(campaignId: string, mapId: string, userId: string, a: z.infer<typeof MapActionSchema>) {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role);
  if (!gm && a.action !== "move") throw new HttpError(403, "Это может только ГМ");
  const own = gm ? [] : await ownCharacters(campaignId, userId);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CampaignMap" WHERE id = ${mapId} FOR UPDATE`;
    const row = await tx.campaignMap.findFirst({ where: { id: mapId, campaignId } });
    if (!row || (!gm && !row.revealed)) throw new HttpError(404, "Карта не найдена");
    const m = mapRow(row);
    let tokens = m.tokens;
    let fog = m.fog;
    let pins = m.pins;
    const center = { x: (m.width || 1000) / 2, y: (m.height || 1000) / 2 };
    // New tokens line up from the centre, one cell apart.
    const lineUp = (i: number, size: number) => snap(m.grid, center.x + (i - 2) * m.grid.size, center.y + Math.floor(i / 5) * m.grid.size, size);

    switch (a.action) {
      case "move": {
        const t = tokens.find((x) => x.id === a.tokenId);
        if (!t) throw new HttpError(404, "Фишка не найдена");
        if (!gm && (t.hidden || !t.characterId || !own.includes(t.characterId))) throw new HttpError(403, "Двигать можно только свою фишку");
        const p = snap(m.grid, a.x, a.y, t.size);
        t.x = Math.max(0, m.width ? Math.min(m.width, p.x) : p.x);
        t.y = Math.max(0, m.height ? Math.min(m.height, p.y) : p.y);
        break;
      }
      case "addTokens":
        tokens = [...tokens, ...a.tokens.map((t) => ({ ...t, id: tid() }))];
        break;
      case "updateToken":
        tokens = tokens.map((t) => (t.id === a.token.id ? a.token : t));
        break;
      case "removeToken":
        tokens = tokens.filter((t) => t.id !== a.tokenId);
        break;
      case "addParty": {
        const party = await tx.campaignCharacter.findMany({
          where: { campaignId, status: "accepted" },
          select: { characterId: true, character: { select: { name: true } } },
        });
        const have = new Set(tokens.map((t) => t.characterId));
        const fresh = party.filter((p) => !have.has(p.characterId));
        tokens = [
          ...tokens,
          ...fresh.map((p, i) => {
            const at = lineUp(i, 1);
            return TokenSchema.parse({ id: tid(), kind: "pc", characterId: p.characterId, name: p.character.name, ...at, color: TOKEN_COLORS[i % 4] });
          }),
        ];
        break;
      }
      case "addEncounter": {
        const e = await tx.encounter.findFirst({ where: { id: a.encounterId, campaignId } });
        if (!e) throw new HttpError(404, "Бой не найден");
        const combatants = parseList(CombatantSchema, e.combatants);
        const sizes = new Map(
          (
            await tx.creature.findMany({
              where: { id: { in: combatants.flatMap((c) => (c.creatureId ? [c.creatureId] : [])) } },
              select: { id: true, size: true },
            })
          ).map((c) => [c.id, SIZE_CELLS[c.size as Size] ?? 1]),
        );
        const have = new Set(tokens.map((t) => t.characterId ?? t.name));
        const fresh = combatants.filter((c) => !have.has(c.characterId ?? c.name));
        tokens = [
          ...tokens,
          ...fresh.map((c, i) => {
            const size = (c.creatureId && sizes.get(c.creatureId)) || 1;
            const color = c.kind === "pc" ? TOKEN_COLORS[i % 4] : c.kind === "monster" ? "#c2410c" : "#475569";
            const at = lineUp(i, size);
            return TokenSchema.parse({
              id: tid(),
              kind: c.kind,
              characterId: c.characterId,
              creatureId: c.creatureId,
              name: c.name,
              ...at,
              size,
              color,
              hidden: c.hidden,
            });
          }),
        ];
        break;
      }
      case "fog":
        if (a.op.w > 0 && a.op.h > 0) fog = { enabled: true, ops: [...fog.ops, a.op].slice(-2000) };
        break;
      case "fogAll":
        fog = { enabled: true, ops: a.reveal ? [{ op: "reveal", x: 0, y: 0, w: m.width || 100000, h: m.height || 100000 }] : [] };
        break;
      case "undoFog":
        fog = { ...fog, ops: fog.ops.slice(0, -1) };
        break;
      case "pin":
        pins = pins.some((p) => p.id === a.pin.id) ? pins.map((p) => (p.id === a.pin.id ? a.pin : p)) : [...pins, a.pin];
        break;
      case "removePin":
        pins = pins.filter((p) => p.id !== a.pinId);
        break;
    }
    await tx.campaignMap.update({
      where: { id: mapId },
      data: { tokens: tokens as unknown as Prisma.InputJsonValue, fog: fog as Prisma.InputJsonValue, pins: pins as Prisma.InputJsonValue },
    });
  });
  await publish({ type: "scope", campaignId, scope: "maps" });
}

/** Masked images are cached: the fog changes rarely compared to reads. */
const masked = new Map<string, Buffer>();

/** The map picture: the original for the GM, fog burnt in for players. */
export async function mapImage(campaignId: string, mapId: string, userId: string, asPlayer: boolean) {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role) && !asPlayer;
  const row = await prisma.campaignMap.findFirst({ where: { id: mapId, campaignId } });
  if (!row || !row.imageId || (!gm && !row.revealed)) throw new HttpError(404, "Карта не найдена");
  const file = await prisma.campaignFile.findFirst({ where: { id: row.imageId, campaignId } });
  if (!file) throw new HttpError(404, "Картинка не найдена");
  const fog = parseFog(row.fog);
  if (gm || !fog.enabled) return { data: file.data, mime: file.mime };

  const key = `${row.id}:${file.id}:${fogKey(fog)}`;
  let out = masked.get(key);
  if (!out) {
    const meta = await sharp(file.data).metadata();
    const w = meta.width ?? row.width;
    const h = meta.height ?? row.height;
    out = await sharp(file.data)
      .composite([{ input: Buffer.from(fogSvg(fog, w, h, "#0b0b0f")), top: 0, left: 0 }])
      .webp({ quality: 82 })
      .toBuffer();
    masked.set(key, out);
    // Keep the cache small: drop the oldest entries.
    while (masked.size > 30) masked.delete(masked.keys().next().value!);
  }
  return { data: out, mime: "image/webp" };
}
