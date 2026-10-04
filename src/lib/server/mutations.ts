import "server-only";
import { z } from "zod";
import { newFeature } from "@/lib/rules/defaults";
import {
  formatDeadTime,
  mutationCount,
  MutationRollSchema,
  reroll,
  rollMutation,
  type MutationDraftRow,
  type MutationRoll,
  type Reroll,
} from "@/lib/mutations";
import type { RichDoc, RichNode } from "@/lib/rules/richtext";
import type { Prisma } from "@/generated/prisma/client";
import { creaturePool } from "./bestiary";
import { requireGm } from "./campaigns";
import { prisma } from "./db";
import { createGrants } from "./grants";
import { HttpError } from "./http";
import { publish } from "./realtime";

// Mutation drafts: the GM rolls the mutations of a character who came back
// from the dead, rerolls what does not fit, writes the stats from the
// creature's statblock and applies them as locked grants.

function parseRolls(raw: unknown): MutationRoll[] {
  const parsed = MutationRollSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export async function listMutationDrafts(campaignId: string, userId: string): Promise<MutationDraftRow[]> {
  await requireGm(campaignId, userId);
  const rows = await prisma.mutationDraft.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" }, take: 50 });
  const names = new Map(
    (await prisma.character.findMany({ where: { id: { in: rows.map((r) => r.characterId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  return rows.map((r) => ({
    id: r.id,
    characterId: r.characterId,
    characterName: names.get(r.characterId) ?? "Персонаж ушёл",
    minutes: r.minutes,
    status: r.status,
    rolls: parseRolls(r.rolls),
    createdAt: r.createdAt.toISOString(),
  }));
}

async function requirePartyCharacter(campaignId: string, characterId: string) {
  const link = await prisma.campaignCharacter.findFirst({ where: { campaignId, characterId, status: "accepted" } });
  if (!link) throw new HttpError(400, "Персонаж не в партии этой кампании");
}

export async function rollMutations(campaignId: string, userId: string, characterId: string, minutes: number) {
  await requireGm(campaignId, userId);
  await requirePartyCharacter(campaignId, characterId);
  const count = mutationCount(minutes);
  if (!count) throw new HttpError(400, "Меньше минуты: мутаций нет");
  const pool = await creaturePool(campaignId);
  if (!pool.length) throw new HttpError(400, "Бестиарий пуст: загрузите существ с dnd.su или добавьте своих");
  const rolls = Array.from({ length: count }, () => rollMutation(pool));
  const row = await prisma.mutationDraft.create({
    data: { campaignId, characterId, minutes, rolls: rolls as unknown as Prisma.InputJsonValue },
  });
  await publish({ type: "scope", campaignId, scope: "mutations" });
  return { id: row.id };
}

async function openDraft(campaignId: string, draftId: string) {
  const d = await prisma.mutationDraft.findFirst({ where: { id: draftId, campaignId } });
  if (!d) throw new HttpError(404, "Бросок не найден");
  if (d.status !== "draft") throw new HttpError(409, "Мутации уже применены");
  return d;
}

export const MutationDraftActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reroll"), index: z.number().int().min(0).max(20), what: z.enum(["danger", "type", "size", "part", "creature"]) }),
  /** The GM's edits: names, notes, effects (rolls themselves stay as rolled). */
  z.object({ action: z.literal("edit"), rolls: z.array(MutationRollSchema).max(20) }),
  z.object({ action: z.literal("apply") }),
  z.object({ action: z.literal("discard") }),
]);

function textDoc(text: string, creatureUrl: string): RichDoc {
  const content: RichNode[] = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
  if (creatureUrl)
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: "Статблок существа", marks: [{ type: "link", attrs: { href: creatureUrl, target: "_blank" } }] }],
    });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export async function mutationDraftAction(campaignId: string, draftId: string, userId: string, a: z.infer<typeof MutationDraftActionSchema>) {
  await requireGm(campaignId, userId);
  const d = await openDraft(campaignId, draftId);
  const rolls = parseRolls(d.rolls);

  if (a.action === "discard") {
    await prisma.mutationDraft.update({ where: { id: d.id }, data: { status: "discarded" } });
  } else if (a.action === "reroll") {
    const prev = rolls[a.index];
    if (!prev) throw new HttpError(400, "Нет такой мутации");
    rolls[a.index] = reroll(await creaturePool(campaignId), prev, a.what as Reroll);
    await prisma.mutationDraft.update({ where: { id: d.id }, data: { rolls: rolls as unknown as Prisma.InputJsonValue } });
  } else if (a.action === "edit") {
    if (a.rolls.length !== rolls.length) throw new HttpError(400, "Число мутаций не совпадает");
    // Only the GM's fields change; what was rolled stays.
    const merged = rolls.map((r, i) => ({ ...r, name: a.rolls[i].name, text: a.rolls[i].text, effects: a.rolls[i].effects }));
    await prisma.mutationDraft.update({ where: { id: d.id }, data: { rolls: merged as unknown as Prisma.InputJsonValue } });
  } else {
    await requirePartyCharacter(campaignId, d.characterId);
    const missing = rolls.findIndex((r) => !r.creatureId);
    if (missing >= 0) throw new HttpError(400, `Мутация ${missing + 1}: существо не найдено, перебросьте фильтр`);
    const creatures = new Map(
      (await prisma.creature.findMany({ where: { id: { in: rolls.map((r) => r.creatureId!) } }, select: { id: true, url: true, nameRu: true } })).map((c) => [
        c.id,
        c,
      ]),
    );
    const reason = `Смерть, ${formatDeadTime(d.minutes)}`;
    // Claim the draft first so a double click cannot apply it twice.
    const claimed = await prisma.mutationDraft.updateMany({ where: { id: d.id, status: "draft" }, data: { status: "applied" } });
    if (!claimed.count) throw new HttpError(409, "Мутации уже применены");
    for (const r of rolls) {
      const creature = creatures.get(r.creatureId!);
      const body = newFeature({
        kind: "mutation",
        name: r.name.trim() || r.creatureName,
        source: "Мутация",
        origin: creature?.nameRu ?? r.creatureName,
        bodyPart: r.part === "choice" ? "" : r.part,
        effects: r.effects,
        description: textDoc(r.text, creature?.url ?? ""),
      });
      await createGrants(campaignId, userId, {
        characterIds: [d.characterId],
        object: { kind: "feature", body },
        delivery: "now",
        lock: "noremove",
        visibility: "visible",
        expires: "never",
        left: 0,
        removal: "",
        reason,
        cursed: false,
        triggers: "",
        bodyPart: r.part,
      });
    }
  }
  await publish({ type: "scope", campaignId, scope: "mutations" });
}
