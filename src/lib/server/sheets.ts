import "server-only";
import type { CharacterEventInput } from "@/lib/events";
import { CharacterDocSchema, type CharacterDoc } from "@/lib/rules/schema";
import type { Prisma } from "@/generated/prisma/client";
import { announceCharacterSaved } from "./campaigns";
import { characterSummary, eventRows } from "./characters";
import { prisma } from "./db";
import { HttpError } from "./http";

// Server-side changes to a character sheet on behalf of the GM: grants, quick
// actions, the party stash. The row is locked, the document changed in place,
// the version bumped and the change written to the character's journal, so the
// player's open sheet notices it and merges it with whatever they were doing.

type Tx = Prisma.TransactionClient;

export type SheetChange = (doc: CharacterDoc) => CharacterEventInput[] | void;

export async function changeSheetTx(tx: Tx, characterId: string, actorId: string | null, fn: SheetChange): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
  const row = await tx.character.findUnique({ where: { id: characterId }, select: { data: true, version: true } });
  if (!row) throw new HttpError(404, "Персонаж не найден");
  const parsed = CharacterDocSchema.safeParse(row.data);
  if (!parsed.success) throw new HttpError(500, "Документ персонажа повреждён");
  const doc = parsed.data;
  const events = fn(doc) ?? [];
  const valid = CharacterDocSchema.parse(doc);
  const version = row.version + 1;
  await tx.character.update({
    where: { id: characterId },
    data: {
      name: valid.name,
      summary: characterSummary(valid),
      avatarUrl: valid.avatarUrl,
      data: valid as unknown as Prisma.InputJsonValue,
      version,
    },
  });
  if (events.length) await tx.characterEvent.createMany({ data: eventRows(characterId, actorId, events) });
  return version;
}

/** One sheet change in its own transaction, announced to the campaign. */
export async function changeSheet(characterId: string, actorId: string | null, fn: SheetChange): Promise<number> {
  const version = await prisma.$transaction((tx) => changeSheetTx(tx, characterId, actorId, fn));
  await announceCharacterSaved(characterId, version);
  return version;
}

export function journal(kind: string, summary: string, reason = "", data?: unknown): CharacterEventInput {
  return { kind, summary: summary.slice(0, 2000), reason: reason.slice(0, 1000), data, at: new Date().toISOString() };
}
