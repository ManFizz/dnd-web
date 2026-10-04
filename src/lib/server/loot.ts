import "server-only";
import { z } from "zod";
import { LootDataSchema, LootTableInputSchema, rollTable, splitCoins, STARTER_TABLES, type LootData, type LootDraftRow, type LootTableRow } from "@/lib/loot";
import { COINS, COIN_LABELS } from "@/lib/rules/constants";
import { newId } from "@/lib/rules/ids";
import type { Item } from "@/lib/rules/schema";
import type { Prisma } from "@/generated/prisma/client";
import { requireGm } from "./campaigns";
import { prisma } from "./db";
import { addItem, createGrants, lockStash, parseObject, saveStash } from "./grants";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { changeSheet, journal } from "./sheets";

// Loot tables and drafts: roll, review, hand out.

function tableRow(t: { id: string; name: string; folder: string; rolls: string; rows: unknown; updatedAt: Date }): LootTableRow {
  const parsed = LootTableInputSchema.safeParse({ name: t.name, folder: t.folder, rolls: t.rolls, rows: t.rows });
  const base = parsed.success ? parsed.data : { name: t.name, folder: t.folder, rolls: t.rolls, rows: [] };
  return { ...base, id: t.id, updatedAt: t.updatedAt.toISOString() };
}

export async function listLootTables(campaignId: string, userId: string): Promise<LootTableRow[]> {
  await requireGm(campaignId, userId);
  const rows = await prisma.lootTable.findMany({ where: { campaignId }, orderBy: [{ folder: "asc" }, { name: "asc" }] });
  return rows.map(tableRow);
}

type TableInput = z.infer<typeof LootTableInputSchema>;

const tableData = (t: TableInput) => ({ name: t.name, folder: t.folder.trim(), rolls: t.rolls || "1", rows: t.rows as unknown as Prisma.InputJsonValue });

export async function createLootTable(campaignId: string, userId: string, input: TableInput) {
  await requireGm(campaignId, userId);
  if ((await prisma.lootTable.count({ where: { campaignId } })) >= 500) throw new HttpError(400, "В кампании уже 500 таблиц");
  const row = await prisma.lootTable.create({ data: { campaignId, ...tableData(input) } });
  await publish({ type: "scope", campaignId, scope: "loot" });
  return { id: row.id };
}

export async function addStarterTables(campaignId: string, userId: string) {
  await requireGm(campaignId, userId);
  await prisma.lootTable.createMany({ data: STARTER_TABLES.map((t) => ({ campaignId, ...tableData(t) })) });
  await publish({ type: "scope", campaignId, scope: "loot" });
}

export async function updateLootTable(campaignId: string, tableId: string, userId: string, input: TableInput) {
  await requireGm(campaignId, userId);
  const res = await prisma.lootTable.updateMany({ where: { id: tableId, campaignId }, data: tableData(input) });
  if (!res.count) throw new HttpError(404, "Таблица не найдена");
  await publish({ type: "scope", campaignId, scope: "loot" });
}

export async function deleteLootTable(campaignId: string, tableId: string, userId: string) {
  await requireGm(campaignId, userId);
  const res = await prisma.lootTable.deleteMany({ where: { id: tableId, campaignId } });
  if (!res.count) throw new HttpError(404, "Таблица не найдена");
  await publish({ type: "scope", campaignId, scope: "loot" });
}

// ---------------------------------------------------------------- drafts

function draftRow(d: { id: string; title: string; status: string; data: unknown; createdAt: Date }): LootDraftRow {
  const parsed = LootDataSchema.safeParse(d.data);
  return { id: d.id, title: d.title, status: d.status, data: parsed.success ? parsed.data : LootDataSchema.parse({}), createdAt: d.createdAt.toISOString() };
}

export async function listLootDrafts(campaignId: string, userId: string): Promise<LootDraftRow[]> {
  await requireGm(campaignId, userId);
  const rows = await prisma.lootDraft.findMany({ where: { campaignId, status: "draft" }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map(draftRow);
}

export const RollLootSchema = z.object({
  tableId: z.string().max(80),
  /** Roll the table this many times (several defeated monsters). */
  times: z.number().int().min(1).max(50).default(1),
  title: z.string().max(200).default(""),
});

export async function rollLoot(campaignId: string, userId: string, input: z.infer<typeof RollLootSchema>) {
  await requireGm(campaignId, userId);
  const [tables, templates] = await Promise.all([
    prisma.lootTable.findMany({ where: { campaignId } }),
    prisma.campaignTemplate.findMany({ where: { campaignId, kind: "item" }, select: { id: true, name: true, folder: true, kind: true } }),
  ]);
  const map = new Map(tables.map((t) => [t.id, tableRow(t)]));
  const table = map.get(input.tableId);
  if (!table) throw new HttpError(404, "Таблица не найдена");
  const data: LootData = LootDataSchema.parse({});
  for (let i = 0; i < input.times; i++) rollTable(table, { tables: map, templates }, data);
  const row = await prisma.lootDraft.create({
    data: {
      campaignId,
      title: input.title.trim() || (input.times > 1 ? `${table.name} ×${input.times}` : table.name),
      data: data as unknown as Prisma.InputJsonValue,
    },
  });
  await publish({ type: "scope", campaignId, scope: "loot" });
  return { id: row.id };
}

export const LootDraftActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), title: z.string().max(200), data: LootDataSchema }),
  z.object({ action: z.literal("discard") }),
  /** Hand out: items to their assignees, coins split between `split`, the rest to the stash. */
  z.object({
    action: z.literal("distribute"),
    split: z.array(z.string().max(80)).max(50),
    reason: z.string().trim().min(1, "Нужна причина: она попадёт в журнал").max(300),
  }),
]);

export async function lootDraftAction(campaignId: string, draftId: string, userId: string, a: z.infer<typeof LootDraftActionSchema>) {
  await requireGm(campaignId, userId);
  const d = await prisma.lootDraft.findFirst({ where: { id: draftId, campaignId, status: "draft" } });
  if (!d) throw new HttpError(404, "Добыча уже роздана или удалена");

  if (a.action === "discard") {
    await prisma.lootDraft.update({ where: { id: d.id }, data: { status: "discarded" } });
  } else if (a.action === "save") {
    await prisma.lootDraft.update({ where: { id: d.id }, data: { title: a.title.trim() || d.title, data: a.data as unknown as Prisma.InputJsonValue } });
  } else {
    const data = draftRow(d).data;
    const party = new Set(
      (await prisma.campaignCharacter.findMany({ where: { campaignId, status: "accepted" }, select: { characterId: true } })).map((c) => c.characterId),
    );
    const unassigned = data.items.filter((i) => !i.assignee);
    if (unassigned.length) throw new HttpError(400, `Не выбрано, кому: ${unassigned.map((i) => i.name).join(", ")}`);
    for (const i of data.items) if (i.assignee !== "stash" && !party.has(i.assignee)) throw new HttpError(400, `«${i.name}»: персонаж не в партии`);
    for (const id of a.split) if (!party.has(id)) throw new HttpError(400, "Делить монеты можно только между персонажами партии");

    const claimed = await prisma.lootDraft.updateMany({ where: { id: d.id, status: "draft" }, data: { status: "distributed" } });
    if (!claimed.count) throw new HttpError(409, "Добыча уже роздана");

    for (const i of data.items.filter((x) => x.assignee !== "stash")) {
      await createGrants(campaignId, userId, {
        characterIds: [i.assignee],
        templateId: i.templateId,
        delivery: "now",
        lock: "none",
        // A cursed find is not identified: the name shows, the properties do not.
        visibility: i.cursed ? "masked" : "visible",
        expires: "never",
        left: 0,
        removal: "",
        reason: a.reason,
        cursed: i.cursed,
        triggers: "",
        quantity: i.quantity,
      });
    }
    const { each, rest } = a.split.length ? splitCoins(data.coins, a.split.length) : { each: null, rest: data.coins };
    if (each && COINS.some((c) => each[c] > 0)) {
      const text = COINS.filter((c) => each[c] > 0)
        .map((c) => `${each[c]} ${COIN_LABELS[c].short}`)
        .join(", ");
      for (const characterId of a.split) {
        await changeSheet(characterId, userId, (doc) => {
          for (const c of COINS) doc.coins[c] += each[c];
          return [journal("coins", `Доля добычи: ${text}`, a.reason)];
        });
      }
    }
    const toStash = data.items.filter((x) => x.assignee === "stash");
    if (toStash.length || COINS.some((c) => rest[c] > 0)) {
      const templates = new Map(
        (await prisma.campaignTemplate.findMany({ where: { campaignId, id: { in: toStash.map((i) => i.templateId) } } })).map((t) => [t.id, t]),
      );
      await prisma.$transaction(async (tx) => {
        const stash = await lockStash(tx, campaignId);
        for (const i of toStash) {
          const tpl = templates.get(i.templateId);
          if (!tpl) continue;
          const body = parseObject(tpl.kind, tpl.body).body as Item;
          addItem(stash.items, { ...body, id: newId("it"), grant: null, quantity: i.quantity });
        }
        for (const c of COINS) stash.coins[c] += rest[c];
        await saveStash(tx, campaignId, stash);
      });
      await publish({ type: "scope", campaignId, scope: "stash" });
    }
  }
  await publish({ type: "scope", campaignId, scope: "loot" });
}
