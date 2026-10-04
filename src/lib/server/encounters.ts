import "server-only";
import { z } from "zod";
import { isGmRole } from "@/lib/campaigns";
import {
  advance,
  CombatantSchema,
  playerView,
  sortCombatants,
  type Combatant,
  type EncounterAction,
  type EncounterRow,
  type EncounterStatus,
} from "@/lib/encounter";
import { AbilitiesSchema } from "@/lib/bestiary";
import { Calculator } from "@/lib/rules/compute";
import { evalFormula, rollValue } from "@/lib/rules/formula";
import { expireOnRound } from "@/lib/rules/grant-rules";
import { CharacterDocSchema } from "@/lib/rules/schema";
import type { Prisma } from "@/generated/prisma/client";
import { requireGm, requireMember } from "./campaigns";
import { prisma } from "./db";
import { quickAction } from "./grants";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { changeSheet, journal } from "./sheets";

// Initiative tracker. Player characters' health is read from their sheets
// every time the fight is shown, so it never goes stale; monsters live in the
// encounter row.

const d20 = () => 1 + Math.floor(Math.random() * 20);
const cid = () => `cb_${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`;

function parseCombatants(raw: unknown): Combatant[] {
  const parsed = CombatantSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function parseLog(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

type Row = { id: string; name: string; status: string; round: number; turn: number; combatants: unknown; log: unknown; updatedAt: Date };

/** Fresh numbers of the player characters from their sheets. */
async function withLiveCharacters(list: Combatant[]): Promise<Combatant[]> {
  const ids = list.filter((c) => c.characterId).map((c) => c.characterId!);
  if (!ids.length) return list;
  const rows = await prisma.character.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, data: true } });
  const live = new Map<string, Partial<Combatant>>();
  for (const r of rows) {
    const doc = CharacterDocSchema.safeParse(r.data);
    if (!doc.success) continue;
    const calc = new Calculator(doc.data);
    live.set(r.id, {
      name: r.name || doc.data.name,
      hp: doc.data.combat.hpCurrent,
      maxHp: calc.value("hp.max"),
      ac: calc.value("ac"),
      initBonus: calc.value("initiative"),
      conditions: doc.data.combat.conditions,
    });
  }
  return list.map((c) => (c.characterId && live.has(c.characterId) ? { ...c, ...live.get(c.characterId) } : c));
}

async function toRow(r: Row): Promise<EncounterRow> {
  return {
    id: r.id,
    name: r.name,
    status: r.status as EncounterStatus,
    round: r.round,
    turn: r.turn,
    combatants: await withLiveCharacters(parseCombatants(r.combatants)),
    log: parseLog(r.log),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listEncounters(campaignId: string, userId: string) {
  const me = await requireMember(campaignId, userId);
  if (isGmRole(me.role)) {
    const rows = await prisma.encounter.findMany({ where: { campaignId }, orderBy: [{ updatedAt: "desc" }], take: 30 });
    return { encounters: await Promise.all(rows.map(toRow)) };
  }
  const active = await prisma.encounter.findFirst({ where: { campaignId, status: "active" }, orderBy: { updatedAt: "desc" } });
  if (!active) return { view: null };
  const own = (await prisma.campaignCharacter.findMany({ where: { campaignId, userId, status: "accepted" }, select: { characterId: true } })).map(
    (c) => c.characterId,
  );
  const row = await toRow(active);
  return { view: { id: row.id, name: row.name, ...playerView(row, own) } };
}

export async function createEncounter(campaignId: string, userId: string, name: string) {
  await requireGm(campaignId, userId);
  const row = await prisma.encounter.create({ data: { campaignId, name: name.trim() || "Бой" } });
  await publish({ type: "scope", campaignId, scope: "encounter" });
  return { id: row.id };
}

export async function deleteEncounter(campaignId: string, encounterId: string, userId: string) {
  await requireGm(campaignId, userId);
  await prisma.encounter.deleteMany({ where: { id: encounterId, campaignId } });
  await publish({ type: "scope", campaignId, scope: "encounter" });
}

function rollFormula(formula: string, fallback: number): number {
  const r = evalFormula(formula, () => undefined);
  return r.ok ? Math.max(1, Math.floor(rollValue(r.value).total)) : fallback;
}

/** "Гоблин 1", "Гоблин 2"... continuing the numbers already in the fight. */
function monsterNames(base: string, count: number, existing: Combatant[]): string[] {
  const used = existing.filter((c) => c.name === base || c.name.startsWith(`${base} `));
  if (count === 1 && !used.length) return [base];
  let n = used.reduce((m, c) => Math.max(m, Number(c.name.slice(base.length + 1)) || 1), 0);
  return Array.from({ length: count }, () => `${base} ${++n}`);
}

export async function encounterAction(campaignId: string, encounterId: string, userId: string, a: EncounterAction) {
  await requireGm(campaignId, userId);
  const sideEffects: (() => Promise<unknown>)[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id = ${encounterId} FOR UPDATE`;
    const e = await tx.encounter.findFirst({ where: { id: encounterId, campaignId } });
    if (!e) throw new HttpError(404, "Бой не найден");
    let list = parseCombatants(e.combatants);
    const log = parseLog(e.log);
    let { round, turn, status, name } = e;
    const currentId = sortCombatants(list)[turn]?.id;

    switch (a.action) {
      case "rename":
        name = a.name;
        break;
      case "addParty": {
        const party = await tx.campaignCharacter.findMany({
          where: { campaignId, status: "accepted" },
          select: { characterId: true, character: { select: { name: true } } },
        });
        const have = new Set(list.map((c) => c.characterId));
        for (const p of party) {
          if (have.has(p.characterId)) continue;
          list.push(CombatantSchema.parse({ id: cid(), kind: "pc", characterId: p.characterId, name: p.character.name }));
        }
        break;
      }
      case "addMonsters": {
        const c = await tx.creature.findFirst({ where: { id: a.creatureId, OR: [{ campaignId: null }, { campaignId }] } });
        if (!c) throw new HttpError(404, "Существо не найдено");
        const abilities = AbilitiesSchema.safeParse(c.abilities);
        const dexMod = abilities.success ? Math.floor((abilities.data.dex - 10) / 2) : 0;
        for (const n of monsterNames(c.nameRu, a.count, list)) {
          const hp = a.rollHp && c.hpFormula ? rollFormula(c.hpFormula, c.hp) : c.hp;
          list.push(
            CombatantSchema.parse({ id: cid(), kind: "monster", creatureId: c.id, name: n, hp, maxHp: hp, ac: c.ac, initBonus: dexMod, hidden: a.hidden }),
          );
        }
        log.push(`Добавлено: ${c.nameRu} ×${a.count}`);
        break;
      }
      case "addNpc":
        list.push(CombatantSchema.parse({ id: cid(), kind: "npc", name: a.name, hp: a.hp, maxHp: a.hp, ac: a.ac, initBonus: a.initBonus }));
        break;
      case "update": {
        const idx = list.findIndex((c) => c.id === a.combatant.id);
        if (idx < 0) throw new HttpError(404, "Участника нет в бою");
        const prev = list[idx];
        // Player characters' numbers come from their sheets; only initiative and visibility change here.
        list[idx] =
          prev.kind === "pc"
            ? { ...prev, initiative: a.combatant.initiative, hidden: a.combatant.hidden, notes: a.combatant.notes }
            : { ...a.combatant, kind: prev.kind, characterId: null, creatureId: prev.creatureId };
        if (prev.hidden && !a.combatant.hidden) log.push(`${prev.name} появляется`);
        break;
      }
      case "remove":
        list = list.filter((c) => c.id !== a.id);
        break;
      case "rollInitiative":
        list = list.map((c) => (c.kind !== "pc" && c.initiative === null ? { ...c, initiative: d20() + c.initBonus } : c));
        break;
      case "start":
        list = list.map((c) => (c.kind !== "pc" && c.initiative === null ? { ...c, initiative: d20() + c.initBonus } : c));
        status = "active";
        round = 1;
        turn = 0;
        log.push("Бой начался, раунд 1");
        break;
      case "next": {
        if (status !== "active") throw new HttpError(400, "Бой ещё не начался");
        const next = advance(round, turn, list.length);
        round = next.round;
        turn = next.turn;
        if (next.newRound) {
          log.push(`Раунд ${round}`);
          // Grants that last N rounds count down on the sheets.
          for (const c of list.filter((x) => x.characterId)) {
            sideEffects.push(() =>
              changeSheet(c.characterId!, userId, (doc) => {
                const ended = expireOnRound(doc);
                return ended.length ? [journal("grant", `Раунд ${round}: закончилось ${ended.map((n) => `«${n}»`).join(", ")}`)] : [];
              }),
            );
          }
        }
        break;
      }
      case "end":
        status = "done";
        log.push(`Бой окончен на раунде ${round}`);
        break;
      case "hp": {
        const c = list.find((x) => x.id === a.id);
        if (!c) throw new HttpError(404, "Участника нет в бою");
        if (c.kind === "pc") {
          sideEffects.push(() =>
            quickAction(campaignId, userId, {
              characterIds: [c.characterId!],
              action: a.delta >= 0 ? "damage" : "heal",
              amount: Math.abs(a.delta),
              condition: "",
              coin: "gp",
              reason: `Бой: ${name}`,
            }),
          );
          break;
        }
        const before = c.hp;
        c.hp = Math.max(0, Math.min(c.maxHp || Infinity, c.hp - a.delta));
        if (before > 0 && c.hp === 0) log.push(`${c.name} повержен`);
        break;
      }
    }
    // Keep the turn on the same combatant when the order changes.
    const sorted = sortCombatants(list);
    if (a.action !== "next" && a.action !== "start" && currentId) {
      const idx = sorted.findIndex((c) => c.id === currentId);
      if (idx >= 0) turn = idx;
    }
    turn = Math.min(turn, Math.max(0, list.length - 1));
    await tx.encounter.update({
      where: { id: e.id },
      data: { name, status, round, turn, combatants: list as unknown as Prisma.InputJsonValue, log: log.slice(-200) as unknown as Prisma.InputJsonValue },
    });
  });
  for (const fx of sideEffects) await fx();
  await publish({ type: "scope", campaignId, scope: "encounter" });
}

export const PlayerInitiativeInput = z.object({ characterId: z.string().max(80), initiative: z.number().int().min(-20).max(60) });

/** A player types the initiative they rolled for their own character. */
export async function setPlayerInitiative(campaignId: string, userId: string, input: z.infer<typeof PlayerInitiativeInput>) {
  await requireMember(campaignId, userId);
  const link = await prisma.campaignCharacter.findFirst({ where: { campaignId, characterId: input.characterId, userId, status: "accepted" } });
  if (!link) throw new HttpError(403, "Это не ваш персонаж");
  await prisma.$transaction(async (tx) => {
    const e = await tx.encounter.findFirst({ where: { campaignId, status: { in: ["prep", "active"] } }, orderBy: { updatedAt: "desc" } });
    if (!e) throw new HttpError(404, "Боя нет");
    await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id = ${e.id} FOR UPDATE`;
    const fresh = await tx.encounter.findUniqueOrThrow({ where: { id: e.id } });
    const list = parseCombatants(fresh.combatants);
    const c = list.find((x) => x.characterId === input.characterId);
    if (!c) throw new HttpError(404, "Персонажа нет в бою");
    const currentId = sortCombatants(list)[fresh.turn]?.id;
    c.initiative = input.initiative;
    const idx = sortCombatants(list).findIndex((x) => x.id === currentId);
    await tx.encounter.update({ where: { id: e.id }, data: { combatants: list as unknown as Prisma.InputJsonValue, turn: idx >= 0 ? idx : fresh.turn } });
  });
  await publish({ type: "scope", campaignId, scope: "encounter" });
}

// ---------------------------------------------------------------- secret rolls

export const SecretRollSchema = z.object({
  characterIds: z.array(z.string().max(80)).min(1).max(50),
  /** Calculator key: skill.perception, save.dex, ability.str.check, initiative. */
  check: z.string().regex(/^(skill\.\w+|save\.\w+|ability\.\w+\.check|initiative)$/),
});

/** The GM rolls a check for the players without them knowing. Not written to journals. */
export async function secretRoll(campaignId: string, userId: string, input: z.infer<typeof SecretRollSchema>) {
  await requireGm(campaignId, userId);
  const links = await prisma.campaignCharacter.findMany({
    where: { campaignId, status: "accepted", characterId: { in: input.characterIds } },
    select: { character: { select: { id: true, name: true, data: true } } },
  });
  return {
    results: links.flatMap(({ character }) => {
      const doc = CharacterDocSchema.safeParse(character.data);
      if (!doc.success) return [];
      const calc = new Calculator(doc.data);
      const stat = calc.get(input.check);
      const roll = d20();
      const second = stat.adv.length !== stat.dis.length ? d20() : null;
      const used = second === null ? roll : stat.adv.length > stat.dis.length ? Math.max(roll, second) : Math.min(roll, second);
      return [
        { characterId: character.id, name: character.name, rolls: second === null ? [roll] : [roll, second], bonus: stat.value, total: used + stat.value },
      ];
    }),
  };
}
