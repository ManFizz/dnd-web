import { ABILITIES, ABILITY_LABELS, XP_BY_LEVEL, type Ability, type SkillId } from "./constants";
import { computeSheet } from "./compute";
import { newCharacterDoc, newEffect, newFeature } from "./defaults";
import { applyBackgroundPreset, applyClassPreset, applyRacePreset, classEntryFromPreset } from "./presets";
import { textToDoc } from "./richtext";
import type { CharacterDoc } from "./schema";
import { BACKGROUND_PRESETS, CLASS_PRESETS, POINT_BUY_BUDGET, POINT_BUY_COST, RACE_PRESETS } from "./tables";

// Builds a new character document from the choices made in the creation wizard.

export type BoostMode = "none" | "2-1" | "1-1-1";

export type CharacterChoices = {
  name: string;
  edition: "2014" | "2024";
  requireReasons: boolean;
  race: { presetId: string | null; name: string };
  cls: { presetId: string | null; name: string; hitDie: number; level: number; subclass: string; skills: SkillId[] };
  background: { presetId: string | null; name: string };
  /** Scores before racial and other increases. */
  scores: Record<Ability, number>;
  /** Free increases: +2/+1 or +1/+1/+1 (2024 backgrounds, custom lineages). */
  boost: { mode: BoostMode; abilities: Ability[] };
};

export function racialBonuses(edition: CharacterChoices["edition"], raceId: string | null): Partial<Record<Ability, number>> {
  // Species in the 2024 rules give no fixed increases; the background does.
  if (edition === "2024") return {};
  return RACE_PRESETS.find((r) => r.id === raceId)?.abilities ?? {};
}

export function boostBonuses(boost: CharacterChoices["boost"]): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  if (boost.mode === "2-1") {
    const [two, one] = boost.abilities;
    if (two) out[two] = 2;
    if (one && one !== two) out[one] = (out[one] ?? 0) + 1;
  } else if (boost.mode === "1-1-1") {
    for (const a of new Set(boost.abilities.slice(0, 3))) out[a] = 1;
  }
  return out;
}

export function pointBuyCost(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[scores[a]] ?? Infinity), 0);
}

export function pointBuyValid(scores: Record<Ability, number>): boolean {
  return pointBuyCost(scores) <= POINT_BUY_BUDGET;
}

/** 4d6, drop the lowest die. */
export function rollAbilityScore(random: () => number = Math.random): number {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(random() * 6)).sort((a, b) => a - b);
  return dice[1] + dice[2] + dice[3];
}

const clampScore = (n: number) => Math.max(1, Math.min(30, Math.round(n)));

export function buildCharacter(c: CharacterChoices): CharacterDoc {
  const level = Math.max(1, Math.min(20, Math.round(c.cls.level)));
  const doc = newCharacterDoc({
    name: c.name.trim() || "Безымянный герой",
    settings: { edition: c.edition, requireReasons: c.requireReasons },
  });
  for (const a of ABILITIES) doc.abilities[a].base = clampScore(c.scores[a]);

  const race = RACE_PRESETS.find((r) => r.id === c.race.presetId);
  if (race) applyRacePreset(doc, c.edition === "2024" ? { ...race, abilities: {} } : race);
  else doc.info.race = c.race.name.trim();

  const cls = CLASS_PRESETS.find((p) => p.id === c.cls.presetId);
  if (cls) {
    applyClassPreset(doc, cls, { level, subclass: c.cls.subclass.trim(), skills: c.cls.skills });
  } else {
    const entry = classEntryFromPreset(null, { name: c.cls.name.trim() || "Класс", level, subclass: c.cls.subclass.trim(), edition: c.edition });
    entry.hitDie = [6, 8, 10, 12].includes(c.cls.hitDie) ? c.cls.hitDie : 8;
    doc.classes.push(entry);
    for (const s of c.cls.skills) {
      doc.skills[s].prof = 1;
      doc.skills[s].source = `Класс: ${entry.name}`;
    }
  }

  const bg = BACKGROUND_PRESETS.find((b) => b.id === c.background.presetId);
  if (bg) applyBackgroundPreset(doc, bg);
  else doc.info.background = c.background.name.trim();

  const boosts = Object.entries(boostBonuses(c.boost)) as [Ability, number][];
  if (boosts.length) {
    const source = c.edition === "2024" && doc.info.background ? `Предыстория: ${doc.info.background}` : "Создание персонажа";
    doc.features.push(
      newFeature({
        kind: c.edition === "2024" ? "background" : "other",
        name: "Увеличение характеристик",
        source,
        effects: boosts.map(([a, n]) => newEffect({ target: `ability.${a}.score`, op: "add", value: String(n), label: "Увеличение характеристик" })),
        description: textToDoc(boosts.map(([a, n]) => `${ABILITY_LABELS[a].full} +${n}`).join(", ")),
      }),
    );
  }

  doc.info.xp = XP_BY_LEVEL[level] ?? 0;
  doc.combat.hpCurrent = computeSheet(doc).hpMax.value;
  return doc;
}

export function choicesSummary(c: CharacterChoices): string {
  const race = RACE_PRESETS.find((r) => r.id === c.race.presetId)?.name ?? c.race.name.trim();
  const cls = CLASS_PRESETS.find((p) => p.id === c.cls.presetId)?.name ?? c.cls.name.trim();
  return [race, cls && `${cls}${c.cls.subclass.trim() ? ` (${c.cls.subclass.trim()})` : ""} ${c.cls.level}`].filter(Boolean).join(", ");
}
