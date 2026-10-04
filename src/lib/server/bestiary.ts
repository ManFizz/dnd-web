import "server-only";
import { z } from "zod";
import {
  AbilitiesSchema,
  BestiaryFileSchema,
  creatureSearchText,
  CustomCreatureSchema,
  ParsedCreatureSchema,
  type CreatureRow,
  type ParsedCreature,
  type Size,
} from "@/lib/bestiary";
import { isGmRole } from "@/lib/campaigns";
import type { PoolCreature } from "@/lib/mutations";
import { RichDocSchema } from "@/lib/rules/schema";
import type { Prisma } from "@/generated/prisma/client";
import { membership, requireGm } from "./campaigns";
import { prisma } from "./db";
import { HttpError } from "./http";
import { publish } from "./realtime";

// The bestiary: creatures imported from dnd.su (shared by everyone) and
// custom creatures of one campaign (seen only by its GMs).

const listSelect = {
  id: true,
  source: true,
  campaignId: true,
  nameRu: true,
  nameEn: true,
  size: true,
  type: true,
  alignment: true,
  cr: true,
  ac: true,
  hp: true,
  hpFormula: true,
  speed: true,
  abilities: true,
  sourceBook: true,
  url: true,
} satisfies Prisma.CreatureSelect;

type Row = Prisma.CreatureGetPayload<{ select: typeof listSelect }> & { statblock?: Prisma.JsonValue };

function toRow(r: Row): CreatureRow {
  const abilities = AbilitiesSchema.safeParse(r.abilities);
  const statblock = r.statblock ? RichDocSchema.safeParse(r.statblock) : null;
  return {
    ...r,
    size: r.size as Size | "",
    abilities: abilities.success ? abilities.data : null,
    statblock: statblock?.success ? statblock.data : undefined,
  };
}

/** Shared creatures plus the custom ones of a campaign the user is GM of. */
async function visibility(userId: string, campaignId: string | undefined): Promise<Prisma.CreatureWhereInput> {
  if (!campaignId) return { campaignId: null };
  const m = await membership(campaignId, userId);
  const gm = m && m.status === "active" && isGmRole(m.role);
  return gm ? { OR: [{ campaignId: null }, { campaignId }] } : { campaignId: null };
}

export const CreatureQuerySchema = z.object({
  campaignId: z.string().max(80).optional(),
  q: z.string().max(200).optional(),
  type: z.string().max(100).optional(),
  size: z.string().max(20).optional(),
  crMin: z.coerce.number().min(0).max(30).optional(),
  crMax: z.coerce.number().min(0).max(30).optional(),
  custom: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function searchCreatures(userId: string, q: z.infer<typeof CreatureQuerySchema>) {
  const and: Prisma.CreatureWhereInput[] = [await visibility(userId, q.campaignId)];
  if (q.q?.trim()) for (const word of creatureSearchText({ nameRu: q.q, nameEn: "", type: "" }).split(" ")) and.push({ searchText: { contains: word } });
  if (q.type) and.push({ type: q.type });
  if (q.size) and.push({ size: q.size });
  if (q.crMin !== undefined) and.push({ cr: { gte: q.crMin } });
  if (q.crMax !== undefined) and.push({ cr: { lte: q.crMax } });
  if (q.custom) and.push({ campaignId: { not: null } });
  const where = { AND: and };
  const [rows, total, types] = await Promise.all([
    prisma.creature.findMany({ where, select: listSelect, orderBy: [{ cr: "asc" }, { nameRu: "asc" }], take: q.limit, skip: q.offset }),
    prisma.creature.count({ where }),
    prisma.creature.groupBy({ by: ["type"], where: and[0], _count: true, orderBy: { type: "asc" } }),
  ]);
  return { creatures: rows.map(toRow), total, types: types.filter((t) => t.type).map((t) => ({ type: t.type, count: t._count })) };
}

export async function getCreature(userId: string, id: string): Promise<CreatureRow> {
  const row = await prisma.creature.findUnique({ where: { id }, select: { ...listSelect, statblock: true } });
  if (!row) throw new HttpError(404, "Существо не найдено");
  if (row.campaignId) {
    const m = await membership(row.campaignId, userId);
    if (!m || m.status !== "active" || !isGmRole(m.role)) throw new HttpError(404, "Существо не найдено");
  }
  return toRow(row);
}

function rowData(c: Omit<ParsedCreature, "source" | "externalId" | "url" | "sourceBook"> & { sourceBook?: string; url?: string }) {
  return {
    nameRu: c.nameRu,
    nameEn: c.nameEn,
    size: c.size,
    type: c.type,
    alignment: c.alignment,
    cr: c.cr,
    ac: c.ac,
    hp: c.hp,
    hpFormula: c.hpFormula,
    speed: c.speed,
    abilities: (c.abilities ?? undefined) as Prisma.InputJsonValue | undefined,
    statblock: c.statblock as unknown as Prisma.InputJsonValue,
    sourceBook: c.sourceBook ?? "",
    url: c.url ?? "",
    searchText: creatureSearchText(c),
  };
}

export async function upsertParsedCreatures(creatures: ParsedCreature[]) {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < creatures.length; i += 50) {
    await prisma.$transaction(async (tx) => {
      for (const c of creatures.slice(i, i + 50)) {
        const key = { source: c.source, externalId: c.externalId };
        const existing = await tx.creature.findUnique({ where: { source_externalId: key }, select: { id: true } });
        if (existing) {
          await tx.creature.update({ where: { id: existing.id }, data: rowData(c) });
          updated++;
        } else {
          await tx.creature.create({ data: { ...key, campaignId: null, ...rowData(c) } });
          created++;
        }
      }
    });
  }
  return { created, updated };
}

/** Our export file or a bare array; bad records are reported, not fatal. */
export function normalizeBestiaryUpload(data: unknown) {
  const file = BestiaryFileSchema.safeParse(data);
  if (!file.success) throw new HttpError(400, "Это не файл бестиария");
  const list = Array.isArray(file.data) ? file.data : file.data.creatures;
  const creatures: ParsedCreature[] = [];
  const rejected: string[] = [];
  for (const raw of list) {
    const parsed = ParsedCreatureSchema.safeParse(raw);
    if (parsed.success) creatures.push(parsed.data);
    else rejected.push(typeof raw === "object" && raw && "nameRu" in raw ? String((raw as { nameRu: unknown }).nameRu) : "?");
  }
  return { creatures, rejected };
}

type CustomInput = z.infer<typeof CustomCreatureSchema>;

export async function createCustomCreature(campaignId: string, userId: string, input: CustomInput) {
  await requireGm(campaignId, userId);
  const count = await prisma.creature.count({ where: { campaignId } });
  if (count >= 2000) throw new HttpError(400, "В кампании уже 2000 своих существ");
  const row = await prisma.creature.create({ data: { source: "custom", externalId: null, campaignId, ...rowData(input) } });
  await publish({ type: "scope", campaignId, scope: "bestiary" });
  return { id: row.id };
}

export async function updateCustomCreature(campaignId: string, creatureId: string, userId: string, input: CustomInput) {
  await requireGm(campaignId, userId);
  const res = await prisma.creature.updateMany({ where: { id: creatureId, campaignId }, data: rowData(input) });
  if (!res.count) throw new HttpError(404, "Существо не найдено");
  await publish({ type: "scope", campaignId, scope: "bestiary" });
}

export async function deleteCustomCreature(campaignId: string, creatureId: string, userId: string) {
  await requireGm(campaignId, userId);
  const res = await prisma.creature.deleteMany({ where: { id: creatureId, campaignId } });
  if (!res.count) throw new HttpError(404, "Существо не найдено");
  await publish({ type: "scope", campaignId, scope: "bestiary" });
}

/** Everything that can drop as a mutation in this campaign. */
export async function creaturePool(campaignId: string): Promise<PoolCreature[]> {
  return prisma.creature.findMany({
    where: { OR: [{ campaignId: null }, { campaignId }], cr: { gte: 1 }, NOT: [{ type: "" }, { size: "" }] },
    select: { id: true, nameRu: true, cr: true, type: true, size: true },
  });
}
