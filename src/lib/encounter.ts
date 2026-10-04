import { z } from "zod";

// Initiative tracker: who fights, in what order, whose turn it is. Players
// get a filtered view: hidden monsters left out, health as words.

export const CombatantSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["pc", "monster", "npc"]),
  characterId: z.string().max(80).nullable().default(null),
  creatureId: z.string().max(80).nullable().default(null),
  name: z.string().max(200),
  initiative: z.number().nullable().default(null),
  /** Bonus for rolling initiative (monsters: DEX modifier). */
  initBonus: z.number().int().min(-20).max(40).default(0),
  hp: z.number().int().min(0).max(100000).default(0),
  maxHp: z.number().int().min(0).max(100000).default(0),
  ac: z.number().int().min(0).max(60).default(10),
  conditions: z.array(z.string().max(60)).max(30).default([]),
  /** Not shown to players (an ambush still hiding). */
  hidden: z.boolean().default(false),
  notes: z.string().max(1000).default(""),
});
export type Combatant = z.infer<typeof CombatantSchema>;

export type EncounterStatus = "prep" | "active" | "done";

export type EncounterRow = {
  id: string;
  name: string;
  status: EncounterStatus;
  round: number;
  turn: number;
  combatants: Combatant[];
  log: string[];
  updatedAt: string;
};

/** Initiative order: highest first, ties by bonus, then by name; nulls last. */
export function sortCombatants(list: Combatant[]): Combatant[] {
  return [...list].sort(
    (a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || b.initBonus - a.initBonus || a.name.localeCompare(b.name, "ru", { numeric: true }),
  );
}

/** Health in words for players. */
export function hpWord(hp: number, max: number): string {
  if (hp <= 0) return "повержен";
  if (!max || hp >= max) return "невредим";
  const r = hp / max;
  if (r > 0.66) return "слегка ранен";
  if (r > 0.33) return "ранен";
  if (r > 0.1) return "тяжело ранен";
  return "при смерти";
}

/** Next turn in a sorted list; skips nobody (the dead still hold their place). */
export function advance(round: number, turn: number, count: number): { round: number; turn: number; newRound: boolean } {
  if (!count) return { round, turn: 0, newRound: false };
  if (round === 0) return { round: 1, turn: 0, newRound: true };
  const next = turn + 1;
  if (next >= count) return { round: round + 1, turn: 0, newRound: true };
  return { round, turn: next, newRound: false };
}

export type PlayerCombatant = {
  id: string;
  kind: Combatant["kind"];
  name: string;
  initiative: number | null;
  health: string;
  conditions: string[];
  characterId: string | null;
};

/** What players see: no hidden entries, no numbers for others' health. */
export function playerView(e: EncounterRow, ownCharacterIds: string[]): { round: number; current: string | null; combatants: PlayerCombatant[] } {
  const sorted = sortCombatants(e.combatants);
  const current = e.status === "active" ? (sorted[e.turn]?.id ?? null) : null;
  return {
    round: e.round,
    current: current && !sorted[e.turn].hidden ? current : null,
    combatants: sorted
      .filter((c) => !c.hidden)
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        initiative: c.initiative,
        health: c.characterId && ownCharacterIds.includes(c.characterId) ? `${c.hp}/${c.maxHp}` : hpWord(c.hp, c.maxHp),
        conditions: c.conditions,
        characterId: c.characterId,
      })),
  };
}

export const EncounterActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(200) }),
  /** Adds every accepted party character not in the fight yet. */
  z.object({ action: z.literal("addParty") }),
  z.object({
    action: z.literal("addMonsters"),
    creatureId: z.string().max(80),
    count: z.number().int().min(1).max(30).default(1),
    /** Roll hit points from the hit dice instead of the average. */
    rollHp: z.boolean().default(false),
    hidden: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("addNpc"),
    name: z.string().trim().min(1).max(200),
    hp: z.number().int().min(0).max(100000),
    ac: z.number().int().min(0).max(60),
    initBonus: z.number().int().min(-20).max(40).default(0),
  }),
  z.object({ action: z.literal("update"), combatant: CombatantSchema }),
  z.object({ action: z.literal("remove"), id: z.string().max(40) }),
  /** Monsters (and NPCs) without initiative roll d20 + bonus. */
  z.object({ action: z.literal("rollInitiative") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("end") }),
  /** Damage (positive) or healing (negative) to a monster or NPC. */
  z.object({ action: z.literal("hp"), id: z.string().max(40), delta: z.number().int().min(-100000).max(100000) }),
]);
export type EncounterAction = z.infer<typeof EncounterActionSchema>;

/** The player's own initiative roll. */
export const PlayerInitiativeSchema = z.object({ characterId: z.string().max(80), initiative: z.number().int().min(-20).max(60) });
