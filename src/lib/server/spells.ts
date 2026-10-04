import "server-only";
import { z } from "zod";
import { spellSearchText, type ParsedSpell } from "@/lib/import/dndsu/parse";
import { RichDocSchema, SpellDataSchema } from "@/lib/rules/schema";
import { normalizeSpellName, spellMatcher, type LibrarySpell } from "@/lib/spells";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { HttpError } from "./http";
import type { SessionUser } from "./session";

const summarySelect = {
  id: true,
  source: true,
  ownerId: true,
  nameRu: true,
  nameEn: true,
  level: true,
  school: true,
  ritual: true,
  concentration: true,
  castingTime: true,
  range: true,
  components: true,
  duration: true,
  classes: true,
  subclasses: true,
  sourceBook: true,
  url: true,
  mechanics: true,
} satisfies Prisma.SpellSelect;

type SpellRow = Prisma.SpellGetPayload<{ select: typeof summarySelect }> & { description?: Prisma.JsonValue };

function toLibrarySpell(row: SpellRow): LibrarySpell {
  const description = row.description ? RichDocSchema.safeParse(row.description) : null;
  return {
    ...row,
    mechanics: (row.mechanics as LibrarySpell["mechanics"]) ?? null,
    description: description?.success ? description.data : undefined,
  };
}

const visibleTo = (userId: string): Prisma.SpellWhereInput => ({ OR: [{ ownerId: null }, { ownerId: userId }] });

export const SpellQuerySchema = z.object({
  q: z.string().max(200).optional(),
  level: z.coerce.number().int().min(0).max(9).optional(),
  cls: z.string().max(100).optional(),
  source: z.string().max(40).optional(),
  mine: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function searchSpells(user: SessionUser, query: z.infer<typeof SpellQuerySchema>) {
  const where: Prisma.SpellWhereInput = { AND: [visibleTo(user.id)] };
  const and = where.AND as Prisma.SpellWhereInput[];
  if (query.q?.trim()) {
    for (const word of normalizeSpellName(query.q).split(" ").filter(Boolean)) and.push({ searchText: { contains: word } });
  }
  if (query.level !== undefined) and.push({ level: query.level });
  if (query.cls) and.push({ classes: { has: query.cls.toLowerCase() } });
  if (query.source) and.push({ source: query.source });
  if (query.mine) and.push({ ownerId: user.id });
  const [rows, total] = await Promise.all([
    prisma.spell.findMany({
      where,
      select: summarySelect,
      orderBy: [{ level: "asc" }, { nameRu: "asc" }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.spell.count({ where }),
  ]);
  return { spells: rows.map(toLibrarySpell), total };
}

export async function getSpellsByIds(user: SessionUser, ids: string[]) {
  if (!ids.length) return [];
  const rows = await prisma.spell.findMany({
    where: { AND: [visibleTo(user.id), { id: { in: ids.slice(0, 1000) } }] },
    select: { ...summarySelect, description: true },
  });
  return rows.map(toLibrarySpell);
}

export async function libraryStats() {
  const groups = await prisma.spell.groupBy({ by: ["source"], where: { ownerId: null }, _count: { _all: true } });
  return Object.fromEntries(groups.map((g) => [g.source, g._count._all]));
}

function rowFromParsed(s: ParsedSpell) {
  return {
    nameRu: s.nameRu,
    nameEn: s.nameEn,
    level: s.level,
    school: s.school,
    ritual: s.ritual,
    concentration: s.concentration,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    classes: s.classes.map((c) => c.toLowerCase()),
    subclasses: s.subclasses,
    description: s.description as unknown as Prisma.InputJsonValue,
    sourceBook: s.sourceBook,
    url: s.url,
    searchText: normalizeSpellName(spellSearchText(s)),
  };
}

export async function upsertParsedSpells(spells: ParsedSpell[]) {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < spells.length; i += 50) {
    const chunk = spells.slice(i, i + 50);
    await prisma.$transaction(async (tx) => {
      for (const s of chunk) {
        const key = { source: s.source, externalId: s.externalId };
        const existing = await tx.spell.findUnique({ where: { source_externalId: key }, select: { id: true } });
        if (existing) {
          await tx.spell.update({ where: { id: existing.id }, data: rowFromParsed(s) });
          updated++;
        } else {
          await tx.spell.create({ data: { ...key, ownerId: null, ...rowFromParsed(s) } });
          created++;
        }
      }
    });
  }
  return { created, updated };
}

export const CustomSpellSchema = SpellDataSchema.extend({ subclasses: z.array(z.string().max(200)).max(80).default([]) });

function rowFromCustom(s: z.infer<typeof CustomSpellSchema>) {
  return {
    nameRu: s.nameRu || "Без названия",
    nameEn: s.nameEn,
    level: s.level,
    school: s.school,
    ritual: s.ritual,
    concentration: s.concentration,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    classes: s.classes.map((c) => c.toLowerCase()),
    subclasses: s.subclasses,
    description: s.description as unknown as Prisma.InputJsonValue,
    mechanics: { attack: s.attack, save: s.save, damage: s.damage, damageType: s.damageType },
    searchText: normalizeSpellName(spellSearchText({ nameRu: s.nameRu, nameEn: s.nameEn, classes: s.classes, school: s.school })),
  };
}

export async function createCustomSpell(user: SessionUser, s: z.infer<typeof CustomSpellSchema>) {
  const row = await prisma.spell.create({ data: { source: "custom", ownerId: user.id, ...rowFromCustom(s) }, select: { ...summarySelect, description: true } });
  return toLibrarySpell(row);
}

async function editable(user: SessionUser, id: string) {
  const row = await prisma.spell.findUnique({ where: { id }, select: { ownerId: true } });
  if (!row) throw new HttpError(404, "Заклинание не найдено");
  const isOwner = row.ownerId === user.id;
  const isAdminShared = row.ownerId === null && user.role === "admin";
  if (!isOwner && !isAdminShared) throw new HttpError(403, "Это заклинание нельзя изменить. Измените его в листе персонажа: правка останется только у него.");
}

export async function updateCustomSpell(user: SessionUser, id: string, s: z.infer<typeof CustomSpellSchema>) {
  await editable(user, id);
  const row = await prisma.spell.update({ where: { id }, data: rowFromCustom(s), select: { ...summarySelect, description: true } });
  return toLibrarySpell(row);
}

export async function deleteSpell(user: SessionUser, id: string) {
  await editable(user, id);
  await prisma.spell.delete({ where: { id } });
}

/** Match spell names (as copied from another site) against the library. */
export async function matchSpellNames(user: SessionUser, names: string[], edition?: "2014" | "2024") {
  const rows = await prisma.spell.findMany({ where: visibleTo(user.id), select: summarySelect });
  const find = spellMatcher(rows, edition);
  return names.map((name) => {
    const hit = find(name);
    return { name, spell: hit ? toLibrarySpell(hit) : null };
  });
}
