import "server-only";
import type { z } from "zod";
import {
  GrantInputSchema,
  GrantPatchSchema,
  GrantResponseSchema,
  QUICK_ACTION_LABELS,
  StageSchema,
  TemplateInputSchema,
  TemplateObjectSchema,
  templateName,
  type GrantRow,
  type GrantStatus,
  type QuickAction,
  type Stage,
  type TemplateKind,
  type TemplateObject,
  type TemplateRow,
  parseStash,
  StashSchema,
  type Stash,
  type StashAction,
} from "@/lib/grants";
import { isGmRole } from "@/lib/campaigns";
import { Calculator, featureKindLabel } from "@/lib/rules/compute";
import { conditionLabel } from "@/lib/rules/conditions";
import { gainInspiration, spendInspiration } from "@/lib/rules/inspiration";
import { findEntry, insertEntry, instantiate, refreshEntry, removeEntry, stripMarks, type GrantEntry, type GrantKind } from "@/lib/rules/grant-rules";
import { newId } from "@/lib/rules/ids";
import { GrantMarkSchema, type Feature, type GrantMark, type Item } from "@/lib/rules/schema";
import type { Prisma } from "@/generated/prisma/client";
import { requireGm, requireMember } from "./campaigns";
import { prisma } from "./db";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { changeSheet, changeSheetTx, journal } from "./sheets";

// GM library and grants: how the GM changes players' sheets.

function parseObject(kind: string, body: unknown): TemplateObject {
  const parsed = TemplateObjectSchema.safeParse({ kind, body });
  if (!parsed.success) throw new HttpError(500, "Шаблон повреждён");
  return parsed.data;
}

function parseStages(raw: unknown): Stage[] {
  const parsed = StageSchema.array().safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

function entryLabel(obj: { kind: GrantKind; body: GrantEntry }): string {
  if (obj.kind === "item") return "предмет";
  if (obj.kind === "counter") return "счётчик";
  return featureKindLabel((obj.body as Feature).kind).toLowerCase();
}

/** Characters accepted into the party, by id. */
async function partyCharacters(campaignId: string) {
  const rows = await prisma.campaignCharacter.findMany({
    where: { campaignId, status: "accepted" },
    select: { characterId: true, userId: true, character: { select: { name: true } } },
  });
  return new Map(rows.map((r) => [r.characterId, { userId: r.userId, name: r.character.name }]));
}

// ---------------------------------------------------------------- library

function templateRow(t: {
  id: string;
  kind: string;
  name: string;
  folder: string;
  tags: string[];
  body: unknown;
  stages: unknown;
  updatedAt: Date;
  _count?: { grants: number };
}): TemplateRow {
  return {
    id: t.id,
    kind: t.kind as TemplateKind,
    name: t.name,
    folder: t.folder,
    tags: t.tags,
    body: parseObject(t.kind, t.body).body,
    stages: parseStages(t.stages),
    activeGrants: t._count?.grants ?? 0,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTemplates(campaignId: string, userId: string): Promise<TemplateRow[]> {
  await requireGm(campaignId, userId);
  const rows = await prisma.campaignTemplate.findMany({
    where: { campaignId },
    orderBy: [{ folder: "asc" }, { name: "asc" }],
    include: { _count: { select: { grants: { where: { status: "active" } } } } },
  });
  return rows.flatMap((r) => {
    try {
      return [templateRow(r)];
    } catch {
      return [];
    }
  });
}

type TemplateInput = z.infer<typeof TemplateInputSchema>;

export async function createTemplate(campaignId: string, userId: string, input: TemplateInput) {
  await requireGm(campaignId, userId);
  const count = await prisma.campaignTemplate.count({ where: { campaignId } });
  if (count >= 2000) throw new HttpError(400, "В библиотеке уже 2000 шаблонов");
  const body = { ...input.body, grant: null };
  const row = await prisma.campaignTemplate.create({
    data: {
      campaignId,
      kind: input.kind,
      name: templateName(input),
      folder: input.folder.trim(),
      tags: input.tags,
      body: body as unknown as Prisma.InputJsonValue,
      stages: input.stages as unknown as Prisma.InputJsonValue,
    },
  });
  await publish({ type: "scope", campaignId, scope: "library" });
  return { id: row.id };
}

export async function importTemplates(campaignId: string, userId: string, templates: TemplateInput[]) {
  await requireGm(campaignId, userId);
  const count = await prisma.campaignTemplate.count({ where: { campaignId } });
  if (count + templates.length > 2000) throw new HttpError(400, "В библиотеке может быть не больше 2000 шаблонов");
  await prisma.campaignTemplate.createMany({
    data: templates.map((t) => ({
      campaignId,
      kind: t.kind,
      name: templateName(t),
      folder: t.folder.trim(),
      tags: t.tags,
      body: { ...t.body, grant: null } as unknown as Prisma.InputJsonValue,
      stages: t.stages as unknown as Prisma.InputJsonValue,
    })),
  });
  await publish({ type: "scope", campaignId, scope: "library" });
  return { imported: templates.length };
}

export async function exportTemplates(campaignId: string, userId: string) {
  const rows = await listTemplates(campaignId, userId);
  return {
    format: "dnd-web-library" as const,
    version: 1 as const,
    templates: rows.map((r) => ({ kind: r.kind, body: r.body, folder: r.folder, tags: r.tags, stages: r.stages })),
  };
}

export async function updateTemplate(campaignId: string, templateId: string, userId: string, input: TemplateInput) {
  await requireGm(campaignId, userId);
  const existing = await prisma.campaignTemplate.findFirst({ where: { id: templateId, campaignId } });
  if (!existing) throw new HttpError(404, "Шаблон не найден");
  if (existing.kind !== input.kind) throw new HttpError(400, "Вид шаблона менять нельзя");
  await prisma.campaignTemplate.update({
    where: { id: templateId },
    data: {
      name: templateName(input),
      folder: input.folder.trim(),
      tags: input.tags,
      body: { ...input.body, grant: null } as unknown as Prisma.InputJsonValue,
      stages: input.stages as unknown as Prisma.InputJsonValue,
    },
  });
  await publish({ type: "scope", campaignId, scope: "library" });
}

export async function deleteTemplate(campaignId: string, templateId: string, userId: string) {
  await requireGm(campaignId, userId);
  const res = await prisma.campaignTemplate.deleteMany({ where: { id: templateId, campaignId } });
  if (!res.count) throw new HttpError(404, "Шаблон не найден");
  await publish({ type: "scope", campaignId, scope: "library" });
}

/** Sends the current template to every sheet that has an active grant of it. */
export async function syncTemplate(campaignId: string, templateId: string, userId: string) {
  await requireGm(campaignId, userId);
  const tpl = await prisma.campaignTemplate.findFirst({ where: { id: templateId, campaignId } });
  if (!tpl) throw new HttpError(404, "Шаблон не найден");
  const obj = parseObject(tpl.kind, tpl.body);
  const stages = parseStages(tpl.stages);
  const grants = await prisma.grant.findMany({ where: { templateId, status: { in: ["active", "offered"] } } });
  for (const g of grants) {
    await prisma.grant.update({
      where: { id: g.id },
      data: { payload: obj.body as unknown as Prisma.InputJsonValue, stages: stages as unknown as Prisma.InputJsonValue, name: obj.body.name },
    });
    if (g.status !== "active") continue;
    await changeSheet(g.characterId, userId, (doc) => {
      const list = obj.kind === "item" ? doc.items : obj.kind === "feature" ? doc.features : doc.counters;
      const idx = list.findIndex((x) => x.grant?.id === g.id);
      if (idx < 0) return;
      const next = refreshEntry(obj.kind, list[idx], obj.body, stages);
      (list as GrantEntry[])[idx] = next;
      return [journal("grant", `ГМ обновил «${obj.body.name}»`, g.reason)];
    });
  }
  await publish({ type: "scope", campaignId, scope: "grants" });
  return { updated: grants.length };
}

// ---------------------------------------------------------------- grants

function grantMark(
  g: { id: string; campaignId: string; lock: string; visibility: string; expires: string; left: number; removal: string; reason: string },
  extra: Partial<GrantMark> = {},
): GrantMark {
  return GrantMarkSchema.parse({
    id: g.id,
    campaignId: g.campaignId,
    lock: g.lock,
    visibility: g.visibility,
    expires: g.expires,
    left: g.left,
    removal: g.removal,
    reason: g.reason,
    ...extra,
  });
}

type GrantInput = z.infer<typeof GrantInputSchema>;

/** Puts an active grant's copy into the sheet; returns replaced grant ids. */
async function deliver(
  tx: Prisma.TransactionClient,
  grant: {
    id: string;
    campaignId: string;
    characterId: string;
    kind: string;
    payload: unknown;
    stages: unknown;
    lock: string;
    visibility: string;
    expires: string;
    left: number;
    removal: string;
    reason: string;
  },
  actorId: string,
  opts: { bodyPart?: string; quantity?: number; cursed?: boolean; triggers?: string; who: string },
) {
  const obj = parseObject(grant.kind, grant.payload);
  const stages = parseStages(grant.stages);
  const replacedGrants: string[] = [];
  const version = await changeSheetTx(tx, grant.characterId, actorId, (doc) => {
    const mark = grantMark(grant, { cursed: !!opts.cursed, triggers: opts.triggers ?? "", stages: stages.length, stage: 0 });
    const entry = instantiate(obj.kind, obj.body, mark, { bodyPart: opts.bodyPart, quantity: opts.quantity, stages });
    const replaced = insertEntry(doc, obj.kind, entry);
    for (const r of replaced) if (r.grant) replacedGrants.push(r.grant.id);
    const hidden = grant.visibility === "hidden";
    const events = [
      journal("grant", hidden ? `${opts.who}: скрытая выдача` : `${opts.who} выдал ${entryLabel(obj)} «${obj.body.name}»`, grant.reason, { grantId: grant.id }),
    ];
    for (const r of replaced) events.push(journal("grant", `Мутация «${r.name}» заменена на «${obj.body.name}»`, grant.reason));
    return events;
  });
  if (replacedGrants.length) await tx.grant.updateMany({ where: { id: { in: replacedGrants } }, data: { status: "removed" } });
  return version;
}

export async function createGrants(campaignId: string, userId: string, input: GrantInput) {
  await requireGm(campaignId, userId);
  const party = await partyCharacters(campaignId);
  for (const id of input.characterIds) if (!party.has(id)) throw new HttpError(400, "Персонаж не в партии этой кампании");

  let obj: TemplateObject;
  let stages: Stage[];
  let templateId: string | null = null;
  if (input.templateId) {
    const tpl = await prisma.campaignTemplate.findFirst({ where: { id: input.templateId, campaignId } });
    if (!tpl) throw new HttpError(404, "Шаблон не найден");
    obj = parseObject(tpl.kind, tpl.body);
    stages = parseStages(tpl.stages);
    templateId = tpl.id;
  } else {
    obj = input.object!;
    stages = input.stages ?? [];
  }
  const choice = input.bodyPart === "choice";
  const payload = { ...obj.body, grant: null } as GrantEntry;
  if (obj.kind === "feature" && input.bodyPart && !choice) (payload as Feature).bodyPart = input.bodyPart;
  if (obj.kind === "item" && input.quantity !== undefined) (payload as Item).quantity = input.quantity;
  // A body part chosen by the player can only be picked when accepting.
  const delivery = choice ? "offer" : input.delivery;

  const touched: { characterId: string; version: number }[] = [];
  const ids: string[] = [];
  for (const characterId of input.characterIds) {
    const result = await prisma.$transaction(async (tx) => {
      const g = await tx.grant.create({
        data: {
          campaignId,
          characterId,
          templateId,
          kind: obj.kind,
          name: obj.body.name,
          payload: { ...payload, bodyPart: choice ? "choice" : (payload as Feature).bodyPart } as unknown as Prisma.InputJsonValue,
          stages: stages as unknown as Prisma.InputJsonValue,
          status: delivery === "offer" ? "offered" : "active",
          lock: input.lock,
          visibility: input.visibility,
          expires: input.expires,
          left: input.left,
          removal: input.removal,
          reason: input.reason,
          createdById: userId,
        },
      });
      ids.push(g.id);
      if (delivery === "offer") return null;
      return deliver(tx, g, userId, { cursed: input.cursed, triggers: input.triggers, who: "ГМ" });
    });
    if (result) touched.push({ characterId, version: result });
  }
  // Remember the curse options for offers too (applied on acceptance).
  if (delivery === "offer" && (input.cursed || input.triggers)) {
    await prisma.grant.updateMany({ where: { id: { in: ids } }, data: { removal: input.removal } });
  }
  for (const t of touched) await publish({ type: "character", campaignId, characterId: t.characterId, version: t.version });
  await publish({ type: "scope", campaignId, scope: "grants" });
  if (delivery === "offer") {
    for (const id of input.characterIds) {
      const c = party.get(id);
      await publish({ type: "notice", campaignId, text: `ГМ предлагает ${c?.name ?? "персонажу"}: «${obj.body.name}»`, gmOnly: false, to: c?.userId });
    }
  }
  return { ids, delivered: touched.length };
}

function grantRow(
  g: {
    id: string;
    characterId: string;
    templateId: string | null;
    kind: string;
    name: string;
    payload: unknown;
    stages: unknown;
    status: string;
    lock: string;
    visibility: string;
    expires: string;
    left: number;
    removal: string;
    reason: string;
    createdAt: Date;
    character: { name: string };
  },
  opts: { full: boolean; stage: number },
): GrantRow {
  let payload: GrantEntry | null = null;
  try {
    payload = parseObject(g.kind, g.payload).body;
  } catch {
    payload = null;
  }
  const masked = !opts.full && g.visibility !== "visible";
  const feature = g.kind === "feature" ? (payload as Feature | null) : null;
  const item = g.kind === "item" ? (payload as Item | null) : null;
  return {
    id: g.id,
    characterId: g.characterId,
    characterName: g.character.name,
    templateId: g.templateId,
    kind: g.kind as TemplateKind,
    name: g.visibility === "hidden" && !opts.full ? "???" : g.name,
    status: g.status as GrantStatus,
    lock: g.lock as GrantRow["lock"],
    visibility: g.visibility as GrantRow["visibility"],
    expires: g.expires as GrantRow["expires"],
    left: g.left,
    removal: g.removal,
    reason: g.reason,
    stage: opts.stage,
    stages: parseStages(g.stages).length,
    subkind: feature?.kind ?? item?.category ?? "counter",
    bodyPart: feature?.bodyPart ?? "",
    createdAt: g.createdAt.toISOString(),
    payload: masked ? null : payload,
  };
}

/** GM: every grant of the campaign. Player: offers and grants of their own characters. */
export async function listGrants(campaignId: string, userId: string): Promise<GrantRow[]> {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role);
  const rows = await prisma.grant.findMany({
    where: {
      campaignId,
      ...(gm ? {} : { character: { ownerId: userId }, status: { in: ["offered", "active"] }, NOT: { visibility: "hidden" } }),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { character: { select: { name: true, data: true } } },
  });
  return rows.map((r) => {
    let stage = 0;
    const doc = r.character.data as { items?: GrantEntry[]; features?: GrantEntry[]; counters?: GrantEntry[] } | null;
    const entry = [...(doc?.items ?? []), ...(doc?.features ?? []), ...(doc?.counters ?? [])].find((x) => x?.grant?.id === r.id);
    if (entry?.grant) stage = entry.grant.stage;
    return grantRow(r, { full: gm, stage });
  });
}

/** Player accepts or declines an offer. */
export async function respondGrant(campaignId: string, grantId: string, userId: string, input: z.infer<typeof GrantResponseSchema>) {
  await requireMember(campaignId, userId);
  const g = await prisma.grant.findFirst({
    where: { id: grantId, campaignId, status: "offered" },
    include: { character: { select: { ownerId: true, name: true } } },
  });
  if (!g || g.character.ownerId !== userId) throw new HttpError(404, "Предложение не найдено");
  if (!input.accept) {
    await prisma.grant.update({ where: { id: g.id }, data: { status: "declined" } });
    await publish({ type: "scope", campaignId, scope: "grants" });
    await publish({ type: "notice", campaignId, text: `${g.character.name} отказался от «${g.name}»`, gmOnly: true });
    return;
  }
  const payload = g.payload as { bodyPart?: string } | null;
  let bodyPart: string | undefined;
  if (g.kind === "feature" && payload?.bodyPart === "choice") {
    if (!input.bodyPart || input.bodyPart === "choice") throw new HttpError(400, "Выберите часть тела");
    bodyPart = input.bodyPart;
  }
  const version = await prisma.$transaction(async (tx) => {
    const updated = await tx.grant.updateMany({ where: { id: g.id, status: "offered" }, data: { status: "active" } });
    if (!updated.count) throw new HttpError(409, "Предложение уже принято");
    return deliver(tx, g, userId, { bodyPart, who: "Принято от ГМа:" });
  });
  await publish({ type: "character", campaignId, characterId: g.characterId, version });
  await publish({ type: "scope", campaignId, scope: "grants" });
  await publish({ type: "notice", campaignId, text: `${g.character.name} принял «${g.name}»`, gmOnly: true });
}

/** GM changes a grant: reveal, lock, timer, stage, or takes it away. */
export async function updateGrant(campaignId: string, grantId: string, userId: string, patch: z.infer<typeof GrantPatchSchema>) {
  await requireGm(campaignId, userId);
  const g = await prisma.grant.findFirst({ where: { id: grantId, campaignId } });
  if (!g) throw new HttpError(404, "Выдача не найдена");
  const stages = parseStages(g.stages);
  if (patch.stage !== undefined && patch.stage >= Math.max(1, stages.length)) throw new HttpError(400, "Такой стадии нет");

  if (g.status === "offered") {
    if (patch.remove) await prisma.grant.update({ where: { id: g.id }, data: { status: "removed" } });
    await publish({ type: "scope", campaignId, scope: "grants" });
    return;
  }
  if (g.status !== "active") throw new HttpError(409, "Выдача уже не действует");

  const data = {
    ...(patch.visibility ? { visibility: patch.visibility } : {}),
    ...(patch.lock ? { lock: patch.lock } : {}),
    ...(patch.removal !== undefined ? { removal: patch.removal } : {}),
    ...(patch.expires ? { expires: patch.expires } : {}),
    ...(patch.left !== undefined ? { left: patch.left } : {}),
    ...(patch.remove ? { status: "removed" } : {}),
  };
  const version = await prisma.$transaction(async (tx) => {
    await tx.grant.update({ where: { id: g.id }, data });
    return changeSheetTx(tx, g.characterId, userId, (doc) => {
      if (patch.remove) {
        const removed = removeEntry(doc, g.id);
        return removed ? [journal("grant", `ГМ снял «${removed.name}»`, patch.reason || g.reason)] : [];
      }
      const entry = findEntry(doc, g.id);
      if (!entry?.grant) return [];
      const events = [];
      const before = entry.grant;
      const next = { ...before, ...data } as GrantMark;
      if (patch.visibility && patch.visibility !== before.visibility && patch.visibility === "visible")
        events.push(journal("grant", `Раскрыто: «${entry.name}»`, patch.reason));
      if (patch.lock && patch.lock !== before.lock)
        events.push(journal("grant", `«${entry.name}»: ${patch.lock === "none" ? "замок снят" : "заперто ГМом"}`, patch.reason));
      if (patch.stage !== undefined && patch.stage !== before.stage) {
        next.stage = patch.stage;
        const stage = stages[patch.stage];
        if (stage && g.kind === "feature") (entry as Feature).effects = JSON.parse(JSON.stringify(stage.effects));
        events.push(journal("grant", `«${entry.name}»: стадия ${patch.stage + 1}${stage?.name ? ` (${stage.name})` : ""}`, patch.reason));
      }
      entry.grant = GrantMarkSchema.parse(next);
      if (!events.length) events.push(journal("grant", `ГМ изменил выдачу «${entry.name}»`, patch.reason));
      return events;
    });
  });
  await publish({ type: "character", campaignId, characterId: g.characterId, version });
  await publish({ type: "scope", campaignId, scope: "grants" });
}

// ---------------------------------------------------------------- quick actions

export async function quickAction(campaignId: string, userId: string, a: QuickAction) {
  await requireGm(campaignId, userId);
  const party = await partyCharacters(campaignId);
  for (const id of a.characterIds) if (!party.has(id)) throw new HttpError(400, "Персонаж не в партии этой кампании");
  const amount = Math.trunc(a.amount);
  const label = QUICK_ACTION_LABELS[a.action];
  for (const characterId of a.characterIds) {
    await changeSheet(characterId, userId, (doc) => {
      const c = doc.combat;
      switch (a.action) {
        case "damage": {
          let left = Math.max(0, amount);
          const fromTemp = Math.min(c.hpTemp, left);
          c.hpTemp -= fromTemp;
          left -= fromTemp;
          const before = c.hpCurrent;
          c.hpCurrent = Math.max(0, c.hpCurrent - left);
          return [journal("hp", `ГМ: урон ${amount}${fromTemp ? ` (${fromTemp} из временных)` : ""}, хиты ${before} → ${c.hpCurrent}`, a.reason)];
        }
        case "heal": {
          const max = new Calculator(JSON.parse(JSON.stringify(doc))).value("hp.max");
          const before = c.hpCurrent;
          c.hpCurrent = Math.min(max, Math.max(0, c.hpCurrent) + Math.max(0, amount));
          if (c.hpCurrent > 0) {
            c.deathSuccesses = 0;
            c.deathFailures = 0;
          }
          return [journal("hp", `ГМ: лечение ${amount}, хиты ${before} → ${c.hpCurrent}`, a.reason)];
        }
        case "temp": {
          const before = c.hpTemp;
          c.hpTemp = Math.max(c.hpTemp, Math.max(0, amount));
          return [journal("hp", `ГМ: временные хиты ${before} → ${c.hpTemp}`, a.reason)];
        }
        case "condition": {
          if (!a.condition || c.conditions.includes(a.condition)) return [];
          c.conditions.push(a.condition);
          return [journal("condition", `ГМ: состояние «${conditionLabel(a.condition)}»`, a.reason)];
        }
        case "uncondition": {
          if (!c.conditions.includes(a.condition)) return [];
          c.conditions = c.conditions.filter((x) => x !== a.condition);
          return [journal("condition", `ГМ: снято состояние «${conditionLabel(a.condition)}»`, a.reason)];
        }
        case "exhaustion": {
          const before = c.exhaustion;
          c.exhaustion = Math.max(0, Math.min(doc.settings.edition === "2024" ? 10 : 6, c.exhaustion + amount));
          return [journal("condition", `ГМ: истощение ${before} → ${c.exhaustion}`, a.reason)];
        }
        case "inspiration": {
          const before = c.inspiration;
          if (amount > 0) for (let i = 0; i < amount; i++) gainInspiration(c, a.reason);
          else for (let i = 0; i < -amount; i++) spendInspiration(c);
          return [journal("inspiration", `ГМ: вдохновение ${before} → ${c.inspiration}`, a.reason)];
        }
        case "xp": {
          const before = doc.info.xp;
          doc.info.xp = Math.max(0, doc.info.xp + amount);
          return [
            journal("xp", `ГМ: опыт ${before.toLocaleString("ru")} → ${doc.info.xp.toLocaleString("ru")} (${amount >= 0 ? "+" : ""}${amount})`, a.reason),
          ];
        }
        case "coins": {
          const before = doc.coins[a.coin];
          doc.coins[a.coin] = Math.max(0, before + amount);
          return [journal("coins", `ГМ: ${a.coin} ${before} → ${doc.coins[a.coin]}`, a.reason)];
        }
      }
    });
  }
  return { done: a.characterIds.length, label };
}

// ---------------------------------------------------------------- party stash

/** Locks the campaign row and returns its stash. */
async function lockStash(tx: Prisma.TransactionClient, campaignId: string): Promise<Stash> {
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
  const row = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { stash: true } });
  return parseStash(row.stash);
}

async function saveStash(tx: Prisma.TransactionClient, campaignId: string, stash: Stash) {
  await tx.campaign.update({ where: { id: campaignId }, data: { stash: StashSchema.parse(stash) as unknown as Prisma.InputJsonValue } });
}

export async function getStash(campaignId: string, userId: string): Promise<Stash> {
  await requireMember(campaignId, userId);
  const row = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { stash: true } });
  return parseStash(row.stash);
}

/** Takes `quantity` of an item out of a list; returns the split-off copy. */
function splitItem(list: Item[], itemId: string, quantity: number | undefined): Item | null {
  const idx = list.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  const item = list[idx];
  const qty = quantity === undefined ? item.quantity : Math.min(item.quantity, quantity);
  if (qty <= 0) return null;
  if (qty >= item.quantity) {
    list.splice(idx, 1);
    return item;
  }
  item.quantity -= qty;
  return { ...JSON.parse(JSON.stringify(item)), id: newId("it"), quantity: qty, equipped: false, attuned: false };
}

/** Puts an item into a list, stacking with an identical one. */
function addItem(list: Item[], item: Item) {
  const plain = (i: Item) => JSON.stringify({ ...i, id: "", quantity: 0, equipped: false, attuned: false });
  const same = !item.grant && list.find((i) => !i.grant && plain(i) === plain(item));
  if (same) same.quantity += item.quantity;
  else list.push({ ...item, equipped: false, attuned: false });
}

function checkMovable(item: Item, gm: boolean) {
  const g = item.grant;
  if (!g) return;
  if (gm) return;
  if (g.lock !== "none") throw new HttpError(403, `«${item.name}» нельзя отдать: так решил ГМ`);
  if (g.cursed && (item.attunement ? item.attuned : item.equipped)) throw new HttpError(403, `«${item.name}» проклят: снять его нельзя`);
}

export async function stashAction(campaignId: string, userId: string, a: StashAction) {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role);
  const party = await partyCharacters(campaignId);
  const own = (characterId: string) => {
    const c = party.get(characterId);
    if (!c) throw new HttpError(400, "Персонаж не в партии этой кампании");
    if (!gm && c.userId !== userId) throw new HttpError(403, "Это не ваш персонаж");
    return c;
  };
  const who = gm ? "ГМ" : "Игрок";
  const touched = new Map<string, number>();
  const notices: string[] = [];

  await prisma.$transaction(async (tx) => {
    switch (a.action) {
      case "put": {
        const c = own(a.characterId);
        const stash = await lockStash(tx, campaignId);
        let moved: Item | null = null;
        const v = await changeSheetTx(tx, a.characterId, userId, (doc) => {
          const item = doc.items.find((i) => i.id === a.itemId);
          if (!item) throw new HttpError(404, "Предмет не найден");
          checkMovable(item, gm);
          moved = splitItem(doc.items, a.itemId, a.quantity);
          if (!moved) throw new HttpError(400, "Нечего класть");
          return [journal("item", `${who}: «${item.name}» ×${moved.quantity} в общий сундук`)];
        });
        touched.set(a.characterId, v);
        const item = moved as Item | null;
        if (!item) return;
        if (item.grant) await tx.grant.updateMany({ where: { id: item.grant.id }, data: { status: "removed" } });
        addItem(stash.items, { ...item, grant: null });
        await saveStash(tx, campaignId, stash);
        notices.push(`${c.name} положил в сундук «${item.name}» ×${item.quantity}`);
        return;
      }
      case "take": {
        const c = own(a.characterId);
        const stash = await lockStash(tx, campaignId);
        const item = splitItem(stash.items, a.stashId, a.quantity);
        if (!item) throw new HttpError(404, "В сундуке такого нет");
        await saveStash(tx, campaignId, stash);
        const v = await changeSheetTx(tx, a.characterId, userId, (doc) => {
          addItem(doc.items, { ...item, id: newId("it") });
          return [journal("item", `${who}: взято из общего сундука «${item.name}» ×${item.quantity}`)];
        });
        touched.set(a.characterId, v);
        notices.push(`${c.name} взял из сундука «${item.name}» ×${item.quantity}`);
        return;
      }
      case "give": {
        const from = own(a.characterId);
        const to = party.get(a.toCharacterId);
        if (!to) throw new HttpError(400, "Получатель не в партии");
        if (a.toCharacterId === a.characterId) throw new HttpError(400, "Это тот же персонаж");
        let moved: Item | null = null;
        const v1 = await changeSheetTx(tx, a.characterId, userId, (doc) => {
          const item = doc.items.find((i) => i.id === a.itemId);
          if (!item) throw new HttpError(404, "Предмет не найден");
          checkMovable(item, gm);
          moved = splitItem(doc.items, a.itemId, a.quantity);
          if (!moved) throw new HttpError(400, "Нечего отдавать");
          return [journal("item", `${who}: «${item.name}» ×${moved.quantity} передан персонажу ${to.name}`)];
        });
        const item = moved as Item | null;
        if (!item) return;
        // The GM's mark travels with the item when the GM moves it.
        const keepMark = gm && item.grant?.campaignId === campaignId;
        if (item.grant) await tx.grant.updateMany({ where: { id: item.grant.id }, data: keepMark ? { characterId: a.toCharacterId } : { status: "removed" } });
        const v2 = await changeSheetTx(tx, a.toCharacterId, userId, (doc) => {
          addItem(doc.items, { ...item, id: newId("it"), grant: keepMark ? item.grant : null });
          return [journal("item", `Получено от ${from.name}: «${item.name}» ×${item.quantity}`)];
        });
        touched.set(a.characterId, v1);
        touched.set(a.toCharacterId, v2);
        notices.push(`${from.name} передал ${to.name} «${item.name}» ×${item.quantity}`);
        return;
      }
      case "coins": {
        const c = own(a.characterId);
        const stash = await lockStash(tx, campaignId);
        if (a.amount < 0 && stash.coins[a.coin] < -a.amount) throw new HttpError(400, "В сундуке столько нет");
        const v = await changeSheetTx(tx, a.characterId, userId, (doc) => {
          if (a.amount > 0 && doc.coins[a.coin] < a.amount) throw new HttpError(400, "У персонажа столько нет");
          doc.coins[a.coin] -= a.amount;
          return [journal("coins", a.amount > 0 ? `${who}: ${a.amount} ${a.coin} в общий сундук` : `${who}: ${-a.amount} ${a.coin} из общего сундука`)];
        });
        stash.coins[a.coin] += a.amount;
        await saveStash(tx, campaignId, stash);
        touched.set(a.characterId, v);
        notices.push(a.amount > 0 ? `${c.name} положил в сундук ${a.amount} ${a.coin}` : `${c.name} взял из сундука ${-a.amount} ${a.coin}`);
        return;
      }
      case "add": {
        if (!gm) throw new HttpError(403, "Это может только ГМ");
        const tpl = await tx.campaignTemplate.findFirst({ where: { id: a.templateId, campaignId, kind: "item" } });
        if (!tpl) throw new HttpError(404, "Шаблон предмета не найден");
        const body = parseObject(tpl.kind, tpl.body).body as Item;
        const stash = await lockStash(tx, campaignId);
        addItem(stash.items, { ...body, id: newId("it"), grant: null, quantity: a.quantity ?? body.quantity ?? 1 });
        await saveStash(tx, campaignId, stash);
        return;
      }
      case "discard": {
        if (!gm) throw new HttpError(403, "Это может только ГМ");
        const stash = await lockStash(tx, campaignId);
        stash.items = stash.items.filter((i) => i.id !== a.stashId);
        await saveStash(tx, campaignId, stash);
        return;
      }
    }
  });
  for (const [characterId, version] of touched) await publish({ type: "character", campaignId, characterId, version });
  await publish({ type: "scope", campaignId, scope: "stash" });
  if (a.action === "give" || a.action === "put" || a.action === "take") await publish({ type: "scope", campaignId, scope: "grants" });
  if (!gm) for (const text of notices) await publish({ type: "notice", campaignId, text, gmOnly: true });
}

// ---------------------------------------------------------------- leaving

/**
 * A character leaves the campaign: the GM's grants stay on the sheet as the
 * player's own entries (no locks any more) and the grant rows are closed.
 */
export async function releaseGrants(campaignId: string, characterIds: string[]) {
  for (const characterId of characterIds) {
    const active = await prisma.grant.count({ where: { campaignId, characterId, status: { in: ["active", "offered"] } } });
    if (!active) continue;
    const version = await prisma.$transaction(async (tx) => {
      await tx.grant.updateMany({ where: { campaignId, characterId, status: { in: ["active", "offered"] } }, data: { status: "detached" } });
      return changeSheetTx(tx, characterId, null, (doc) => {
        const n = stripMarks(doc, campaignId);
        return n ? [journal("grant", `Персонаж покинул кампанию: выдачи ГМа (${n}) остались без замков`)] : [];
      });
    });
    void version;
  }
}
