import { z } from "zod";
import { SIZES, type Size } from "./creatures";
import { EffectSchema } from "./rules/schema";

// Mutations after death, by the rules of Vladimir's GM:
// - the number of mutations is the number of time thresholds the character
//   stayed dead for (1 min, 10 min, 1 h, 12 h, 1 day, 1 week, 1 month);
// - each mutation rolls a danger (d20 = challenge rating, CR below 1 never
//   drops), a creature type and a size (each equally likely among those in the
//   bestiary), a random creature with all three, and a body part (d6);
// - no creature: the danger goes up to 20, then above 20; still nothing: the
//   GM rerolls one of the filters.

export const DEATH_THRESHOLDS: { minutes: number; label: string }[] = [
  { minutes: 1, label: "1 минута" },
  { minutes: 10, label: "10 минут" },
  { minutes: 60, label: "1 час" },
  { minutes: 720, label: "12 часов" },
  { minutes: 1440, label: "1 день" },
  { minutes: 10080, label: "1 неделя" },
  { minutes: 43200, label: "1 месяц" },
];

export function mutationCount(minutes: number): number {
  return DEATH_THRESHOLDS.filter((t) => minutes >= t.minutes).length;
}

/** "2 дня 3 часа" style text for a number of minutes. */
export function formatDeadTime(minutes: number): string {
  const parts: string[] = [];
  const units: [number, [string, string, string]][] = [
    [1440, ["день", "дня", "дней"]],
    [60, ["час", "часа", "часов"]],
    [1, ["минута", "минуты", "минут"]],
  ];
  let left = Math.max(0, Math.round(minutes));
  for (const [size, forms] of units) {
    const n = Math.floor(left / size);
    left -= n * size;
    if (!n) continue;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
    parts.push(`${n} ${form}`);
    if (parts.length === 2) break;
  }
  return parts.join(" ") || "меньше минуты";
}

/** The five body parts of the d6 table; 6 is the player's choice. */
export const MUTATION_PARTS = [
  { id: "head", label: "Голова" },
  { id: "torso", label: "Тело" },
  { id: "arms", label: "Руки" },
  { id: "legs", label: "Ноги" },
  { id: "tail", label: "Хвост, спина, крылья" },
] as const;

export function mutationPartLabel(id: string): string {
  if (id === "choice") return "На выбор игрока";
  return MUTATION_PARTS.find((p) => p.id === id)?.label ?? id;
}

export type PoolCreature = { id: string; nameRu: string; cr: number; type: string; size: string };

export const MutationRollSchema = z.object({
  dangerRoll: z.number().int().min(1).max(20),
  /** Challenge rating of the creature found (or the last one searched). */
  danger: z.number(),
  type: z.string().max(100),
  size: z.enum(SIZES).or(z.literal("")),
  partRoll: z.number().int().min(1).max(6),
  /** Body part id, or "choice". */
  part: z.string().max(40),
  creatureId: z.string().nullable(),
  creatureName: z.string().max(300),
  log: z.array(z.string().max(300)).max(40),
  /** What the GM makes of it before applying. */
  name: z.string().max(200),
  text: z.string().max(5000).default(""),
  effects: z.array(EffectSchema).max(100).default([]),
});
export type MutationRoll = z.infer<typeof MutationRollSchema>;

export type Rng = () => number;
const die = (sides: number, rng: Rng) => 1 + Math.floor(rng() * sides);
const pick = <T>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

export type RollFilters = { dangerRoll?: number; type?: string; size?: Size | ""; partRoll?: number; excludeCreature?: string };

/** Creatures that can drop: CR 0, 1/8, 1/4 and 1/2 never do. */
export function mutationPool(creatures: PoolCreature[]): PoolCreature[] {
  return creatures.filter((c) => c.cr >= 1 && c.type && c.size);
}

export function rollMutation(creatures: PoolCreature[], rng: Rng = Math.random, fixed: RollFilters = {}): MutationRoll {
  const pool = mutationPool(creatures);
  const types = [...new Set(pool.map((c) => c.type))].sort();
  const sizes = [...new Set(pool.map((c) => c.size))].sort() as Size[];
  const dangerRoll = fixed.dangerRoll ?? die(20, rng);
  const type = fixed.type ?? (types.length ? pick(types, rng) : "");
  const size = fixed.size ?? (sizes.length ? pick(sizes, rng) : "");
  const partRoll = fixed.partRoll ?? die(6, rng);
  const part = partRoll === 6 ? "choice" : MUTATION_PARTS[partRoll - 1].id;
  const log: string[] = [];

  const matching = pool.filter((c) => c.type === type && c.size === size && c.id !== fixed.excludeCreature);
  let found: PoolCreature | null = null;
  let danger = dangerRoll;
  for (let cr = dangerRoll; cr <= 20 && !found; cr++) {
    const here = matching.filter((c) => c.cr === cr);
    danger = cr;
    if (here.length) found = pick(here, rng);
    else log.push(`Опасность ${cr}: нет подходящих существ`);
  }
  if (!found) {
    const above = [...new Set(matching.filter((c) => c.cr > 20).map((c) => c.cr))].sort((a, b) => a - b);
    for (const cr of above) {
      const here = matching.filter((c) => c.cr === cr);
      danger = cr;
      if (here.length) {
        found = pick(here, rng);
        break;
      }
    }
  }
  if (!found) log.push("Существо не нашлось: перебросьте тип или размер");
  const partLabel = mutationPartLabel(part);
  return {
    dangerRoll,
    danger,
    type,
    size,
    partRoll,
    part,
    creatureId: found?.id ?? null,
    creatureName: found?.nameRu ?? "",
    log,
    name: found ? (part === "choice" ? `Мутация: ${found.nameRu}` : `${partLabel}: ${found.nameRu}`) : "",
    text: "",
    effects: [],
  };
}

export type Reroll = "danger" | "type" | "size" | "part" | "creature";

export const REROLL_LABELS: Record<Reroll, string> = {
  danger: "Опасность",
  type: "Тип",
  size: "Размер",
  part: "Часть тела",
  creature: "Другое существо",
};

/** Rerolls one thing and keeps the rest of the roll. */
export function reroll(creatures: PoolCreature[], prev: MutationRoll, what: Reroll, rng: Rng = Math.random): MutationRoll {
  if (what === "part") {
    const partRoll = die(6, rng);
    const part = partRoll === 6 ? "choice" : MUTATION_PARTS[partRoll - 1].id;
    const name = prev.creatureName ? (part === "choice" ? `Мутация: ${prev.creatureName}` : `${mutationPartLabel(part)}: ${prev.creatureName}`) : prev.name;
    return { ...prev, partRoll, part, name };
  }
  const fixed: RollFilters = {
    dangerRoll: what === "danger" ? undefined : prev.dangerRoll,
    type: what === "type" ? undefined : prev.type,
    size: what === "size" ? undefined : prev.size,
    partRoll: prev.partRoll,
    excludeCreature: what === "creature" ? (prev.creatureId ?? undefined) : undefined,
  };
  const next = rollMutation(creatures, rng, fixed);
  return { ...next, text: prev.text, effects: prev.effects };
}

export type MutationDraftRow = {
  id: string;
  characterId: string;
  characterName: string;
  minutes: number;
  status: string;
  rolls: MutationRoll[];
  createdAt: string;
};
