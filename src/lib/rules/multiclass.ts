import { ABILITY_LABELS, SKILLS, proficiencyForLevel, type Ability, type SkillId } from "./constants";
import { newId } from "./ids";
import { classEntryFromPreset } from "./presets";
import type { CharacterDoc, CharacterSpell, ClassEntry, ProfEntry } from "./schema";
import { CLASS_PRESETS, cantripTier, computePact, computeSlots, findClassPreset, type ClassPreset } from "./tables";

// Multiclassing: ability prerequisites, the reduced proficiencies a new class
// grants, and what changes when a class gains a level. Game mechanics follow
// the 2014 and 2024 rules; the dialogs let players adjust anything.

export type MulticlassRule = {
  /** Minimum scores; any one group is enough (a fighter needs STR 13 or DEX 13). */
  requires: Partial<Record<Ability, number>>[];
  armor: string[];
  weapons: string[];
  tools: string[];
  /** Skills to pick: from the class list or from any skill. */
  skills: { count: number; from: "class" | "any" };
};

const LIGHT = "Лёгкие доспехи";
const MEDIUM = "Средние доспехи";
const SHIELDS = "Щиты";
const SIMPLE = "Простое оружие";
const MARTIAL = "Воинское оружие";
const THIEVES = "Воровские инструменты";
const NO_SKILLS = { count: 0, from: "class" } as const;

const rule = (r: Partial<MulticlassRule> & Pick<MulticlassRule, "requires">): MulticlassRule => ({
  armor: [],
  weapons: [],
  tools: [],
  skills: NO_SKILLS,
  ...r,
});

const RULES_2014: Record<string, MulticlassRule> = {
  artificer: rule({ requires: [{ int: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], tools: [THIEVES, "Инструменты ремонтника"] }),
  barbarian: rule({ requires: [{ str: 13 }], armor: [SHIELDS], weapons: [SIMPLE, MARTIAL] }),
  bard: rule({ requires: [{ cha: 13 }], armor: [LIGHT], tools: ["Музыкальный инструмент на выбор"], skills: { count: 1, from: "any" } }),
  cleric: rule({ requires: [{ wis: 13 }], armor: [LIGHT, MEDIUM, SHIELDS] }),
  druid: rule({ requires: [{ wis: 13 }], armor: [LIGHT, MEDIUM, SHIELDS] }),
  fighter: rule({ requires: [{ str: 13 }, { dex: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL] }),
  monk: rule({ requires: [{ dex: 13, wis: 13 }], weapons: [SIMPLE, "Короткие мечи"] }),
  paladin: rule({ requires: [{ str: 13, cha: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL] }),
  ranger: rule({ requires: [{ dex: 13, wis: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [SIMPLE, MARTIAL], skills: { count: 1, from: "class" } }),
  rogue: rule({ requires: [{ dex: 13 }], armor: [LIGHT], tools: [THIEVES], skills: { count: 1, from: "class" } }),
  sorcerer: rule({ requires: [{ cha: 13 }] }),
  warlock: rule({ requires: [{ cha: 13 }], armor: [LIGHT], weapons: [SIMPLE] }),
  wizard: rule({ requires: [{ int: 13 }] }),
};

// 2024: every class already has simple weapons, so only the extra training is listed.
const RULES_2024: Record<string, MulticlassRule> = {
  ...RULES_2014,
  barbarian: rule({ requires: [{ str: 13 }], armor: [SHIELDS], weapons: [MARTIAL] }),
  druid: rule({ requires: [{ wis: 13 }], armor: [LIGHT, SHIELDS] }),
  fighter: rule({ requires: [{ str: 13 }, { dex: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [MARTIAL] }),
  paladin: rule({ requires: [{ str: 13, cha: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [MARTIAL] }),
  ranger: rule({ requires: [{ dex: 13, wis: 13 }], armor: [LIGHT, MEDIUM, SHIELDS], weapons: [MARTIAL], skills: { count: 1, from: "class" } }),
  warlock: rule({ requires: [{ cha: 13 }], armor: [LIGHT] }),
};

export function multiclassRule(presetId: string, edition: "2014" | "2024"): MulticlassRule | null {
  return (edition === "2024" ? RULES_2024 : RULES_2014)[presetId] ?? null;
}

export function requirementText(r: MulticlassRule): string {
  return r.requires
    .map((group) =>
      Object.entries(group)
        .map(([a, n]) => `${ABILITY_LABELS[a as Ability].full} ${n}`)
        .join(" и "),
    )
    .join(" или ");
}

/** Unmet prerequisites for the given classes, e.g. "Паладин: нужно Сила 13 и Харизма 13". */
export function prerequisiteIssues(scores: Record<Ability, number>, presetIds: string[], edition: "2014" | "2024"): string[] {
  const issues: string[] = [];
  for (const id of new Set(presetIds)) {
    const r = multiclassRule(id, edition);
    const preset = CLASS_PRESETS.find((p) => p.id === id);
    if (!r || !preset) continue;
    const ok = r.requires.some((group) => Object.entries(group).every(([a, n]) => scores[a as Ability] >= (n ?? 0)));
    if (!ok) issues.push(`${preset.name}: нужно ${requirementText(r)}`);
  }
  return issues;
}

export function skillOptions(preset: ClassPreset | null, r: MulticlassRule | null): SkillId[] {
  if (!r || r.skills.count === 0) return [];
  if (r.skills.from === "any" || !preset || preset.skillChoices.from === "any") return Object.keys(SKILLS) as SkillId[];
  return preset.skillChoices.from;
}

function addProf(list: ProfEntry[], name: string, source: string) {
  if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
  list.push({ id: newId("pf"), name, source });
}

export type NewClassOptions = {
  preset: ClassPreset | null;
  name?: string;
  subclass?: string;
  level: number;
  armor: string[];
  weapons: string[];
  tools: string[];
  skills: SkillId[];
};

/** Adds a second (third...) class. No saving throws, only the chosen proficiencies. */
export function addMulticlass(doc: CharacterDoc, o: NewClassOptions): ClassEntry {
  const entry = classEntryFromPreset(o.preset, { name: o.name, level: o.level, subclass: o.subclass, edition: doc.settings.edition });
  doc.classes.push(entry);
  const source = `Мультикласс: ${entry.name}`;
  for (const a of o.armor) addProf(doc.proficiencies.armor, a, source);
  for (const w of o.weapons) addProf(doc.proficiencies.weapons, w, source);
  for (const t of o.tools) addProf(doc.proficiencies.tools, t, source);
  for (const s of o.skills) {
    if (doc.skills[s].prof < 1) {
      doc.skills[s].prof = 1;
      doc.skills[s].source = source;
    }
  }
  return entry;
}

/** Class levels that usually give an ability score increase or a feat. */
export function asiLevels(presetId: string): number[] {
  if (presetId === "fighter") return [4, 6, 8, 12, 14, 16, 19];
  if (presetId === "rogue") return [4, 8, 10, 12, 16, 19];
  return [4, 8, 12, 16, 19];
}

export type LevelUpSummary = {
  level: [number, number];
  prof: [number, number];
  hitDie: number;
  /** Spell slot changes by spell level: [before, after]. */
  slots: { level: number; before: number; after: number }[];
  pact: { before: { count: number; level: number }; after: { count: number; level: number } } | null;
  cantripsGrow: boolean;
  asi: boolean;
};

/** What a level in the given class changes (HP is compared separately with the computed sheet). */
export function levelUpSummary(doc: CharacterDoc, classId: string): LevelUpSummary | null {
  const entry = doc.classes.find((c) => c.id === classId);
  if (!entry || entry.level >= 20) return null;
  const before = doc.classes;
  const after = doc.classes.map((c) => (c.id === classId ? { ...c, level: c.level + 1 } : c));
  const total = (list: ClassEntry[]) => Math.max(1, list.reduce((a, c) => a + c.level, 0));
  const [l0, l1] = [total(before), total(after)];
  const s0 = computeSlots(before);
  const s1 = computeSlots(after);
  const slots = Array.from({ length: 9 }, (_, i) => i + 1)
    .map((level) => ({ level, before: s0[level] ?? 0, after: s1[level] ?? 0 }))
    .filter((x) => x.before !== x.after);
  const p0 = computePact(before);
  const p1 = computePact(after);
  return {
    level: [l0, l1],
    prof: [proficiencyForLevel(l0), proficiencyForLevel(l1)],
    hitDie: entry.hitDie,
    slots,
    pact: p0.count !== p1.count || p0.level !== p1.level ? { before: p0, after: p1 } : null,
    cantripsGrow: cantripTier(l1) > cantripTier(l0),
    asi: asiLevels(entry.preset).includes(entry.level + 1),
  };
}

/** Raises one class by a level; current HP grows by the same amount as the maximum. */
export function applyLevelUp(doc: CharacterDoc, classId: string, hpGain: number): void {
  const entry = doc.classes.find((c) => c.id === classId);
  if (!entry || entry.level >= 20) return;
  entry.level += 1;
  if (hpGain > 0) doc.combat.hpCurrent += hpGain;
}

/** Moves a class to the front: the starting class gets the full hit die at level 1. */
export function makeStartingClass(doc: CharacterDoc, classId: string): void {
  const idx = doc.classes.findIndex((c) => c.id === classId);
  if (idx <= 0) return;
  const [entry] = doc.classes.splice(idx, 1);
  doc.classes.unshift(entry);
}

const normName = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

/** Names a class is known by: its own name plus the preset's name and aliases. */
function classNames(c: Pick<ClassEntry, "name" | "preset">): string[] {
  const preset = findClassPreset(c.preset || c.name);
  return [c.name, ...(preset ? [preset.name, ...preset.aliases] : [])].map(normName).filter(Boolean);
}

/**
 * The casting class a spell uses: the one chosen for it, or the only class
 * of the character that appears on the spell's class list.
 */
export function spellClassId(
  entry: Pick<CharacterSpell, "classId">,
  casters: Pick<ClassEntry, "id" | "name" | "preset">[],
  spellClasses: string[],
): string | null {
  if (entry.classId && casters.some((c) => c.id === entry.classId)) return entry.classId;
  const list = new Set(spellClasses.map(normName));
  const hits = casters.filter((c) => classNames(c).some((n) => list.has(n)));
  return hits.length === 1 ? hits[0].id : null;
}
