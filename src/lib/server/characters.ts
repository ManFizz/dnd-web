import "server-only";
import { z } from "zod";
import { CharacterEventInputSchema, type CharacterEventInput, type CharacterEventRow } from "@/lib/events";
import { CharacterDocSchema, type CharacterDoc } from "@/lib/rules/schema";
import { Prisma } from "@/generated/prisma/client";
import { announceCharacterSaved, gmCampaignFor } from "./campaigns";
import { prisma } from "./db";
import { HttpError } from "./http";
import { publish } from "./realtime";

export function characterSummary(doc: CharacterDoc): string {
  const classes = doc.classes.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / ");
  return [doc.info.race, classes].filter(Boolean).join(", ");
}

/** Avatars may be data URLs; keep them out of list queries. */
function listAvatar(url: string): string {
  return url.length > 2000 ? "" : url;
}

export async function listCharacters(userId: string) {
  const rows = await prisma.character.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, summary: true, avatarUrl: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, avatarUrl: listAvatar(r.avatarUrl), updatedAt: r.updatedAt.toISOString() }));
}

/**
 * Who may read a character: its owner, or the GM (and co-GMs) of the campaign it is in.
 * Only the owner may change it.
 */
export type CharacterAccess = { kind: "owner" } | { kind: "gm"; campaignId: string };

async function readAccess(ownerId: string, characterId: string, userId: string): Promise<CharacterAccess | null> {
  if (ownerId === userId) return { kind: "owner" };
  const campaignId = await gmCampaignFor(characterId, userId);
  return campaignId ? { kind: "gm", campaignId } : null;
}

export async function getCharacter(id: string, userId: string) {
  const row = await prisma.character.findUnique({ where: { id } });
  const access = row ? await readAccess(row.ownerId, id, userId) : null;
  if (!row || !access) throw new HttpError(404, "Персонаж не найден");
  const parsed = CharacterDocSchema.safeParse(row.data);
  if (!parsed.success) throw new HttpError(500, "Документ персонажа повреждён");
  return { id: row.id, version: row.version, doc: parsed.data, updatedAt: row.updatedAt.toISOString(), access };
}

function eventRows(characterId: string, userId: string, events: CharacterEventInput[]) {
  return events.map((e) => {
    const ev = CharacterEventInputSchema.parse(e);
    const at = ev.at ? new Date(ev.at) : new Date();
    return {
      characterId,
      userId,
      kind: ev.kind,
      summary: ev.summary,
      reason: ev.reason,
      data: ev.data === undefined ? Prisma.JsonNull : (ev.data as Prisma.InputJsonValue),
      createdAt: Number.isNaN(at.getTime()) ? new Date() : at,
    };
  });
}

export async function createCharacter(userId: string, doc: CharacterDoc, events: CharacterEventInput[]) {
  const parsed = CharacterDocSchema.parse(doc);
  return prisma.$transaction(async (tx) => {
    const row = await tx.character.create({
      data: {
        ownerId: userId,
        name: parsed.name,
        summary: characterSummary(parsed),
        avatarUrl: parsed.avatarUrl,
        data: parsed as unknown as Prisma.InputJsonValue,
      },
    });
    if (events.length) await tx.characterEvent.createMany({ data: eventRows(row.id, userId, events) });
    return { id: row.id, version: row.version };
  });
}

export const SaveCharacterSchema = z.object({
  baseVersion: z.number().int().min(1),
  doc: CharacterDocSchema,
  events: z.array(CharacterEventInputSchema).max(500).default([]),
});

export async function saveCharacter(id: string, userId: string, input: z.infer<typeof SaveCharacterSchema>) {
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.character.updateMany({
      where: { id, ownerId: userId, version: input.baseVersion },
      data: {
        name: input.doc.name,
        summary: characterSummary(input.doc),
        avatarUrl: input.doc.avatarUrl,
        data: input.doc as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await tx.character.findUnique({ where: { id }, select: { ownerId: true, version: true } });
      if (!exists || exists.ownerId !== userId) throw new HttpError(404, "Персонаж не найден");
      throw new HttpError(409, "Персонаж изменён в другом окне", { version: exists.version });
    }
    if (input.events.length) await tx.characterEvent.createMany({ data: eventRows(id, userId, input.events) });
    return { version: input.baseVersion + 1 };
  });
  await announceCharacterSaved(id, saved.version);
  return saved;
}

export async function deleteCharacter(id: string, userId: string) {
  const link = await prisma.campaignCharacter.findUnique({ where: { characterId: id }, select: { campaignId: true } });
  const res = await prisma.character.deleteMany({ where: { id, ownerId: userId } });
  if (res.count === 0) throw new HttpError(404, "Персонаж не найден");
  if (link) await publish({ type: "characters", campaignId: link.campaignId });
}

export async function listEvents(id: string, userId: string, opts: { cursor?: string; limit?: number; kind?: string; q?: string }) {
  const owner = await prisma.character.findUnique({ where: { id }, select: { ownerId: true } });
  if (!owner || !(await readAccess(owner.ownerId, id, userId))) throw new HttpError(404, "Персонаж не найден");
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const q = opts.q?.trim().slice(0, 200);
  const rows = await prisma.characterEvent.findMany({
    where: {
      characterId: id,
      ...(opts.kind ? { kind: opts.kind } : {}),
      // Search looks at both the summary and the "за что" reason.
      ...(q
        ? {
            OR: [{ summary: { contains: q, mode: "insensitive" as const } }, { reason: { contains: q, mode: "insensitive" as const } }],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { user: { select: { name: true } } },
  });
  const page = rows.slice(0, limit);
  const events: CharacterEventRow[] = page.map((r) => ({
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    reason: r.reason,
    data: r.data,
    createdAt: r.createdAt.toISOString(),
    userName: r.user?.name ?? null,
  }));
  return { events, nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}
