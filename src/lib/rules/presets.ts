import { ABILITY_LABELS, SKILLS, type Ability } from "./constants";
import { newEffect, newFeature } from "./defaults";
import { newId } from "./ids";
import { textToDoc } from "./richtext";
import type { CharacterDoc, ClassEntry, Effect, ProfEntry } from "./schema";
import type { BackgroundPreset, ClassPreset, RacePreset } from "./tables";

// Applying race, class and background presets to a (mutable) document. Every
// bonus carries its source, so the sheet can explain where numbers come from.

type EffectInput = Pick<Effect, "target" | "op" | "value"> & { label?: string };

/** Mechanics for race traits that the sheet can track automatically. */
const TRAIT_EFFECTS: Record<string, EffectInput[]> = {
  "Дварфийская устойчивость": [
    { target: "resist", op: "grant", value: "Яд" },
    { target: "save.all", op: "note", value: "Преимущество против яда" },
  ],
  "Адское сопротивление": [{ target: "resist", op: "grant", value: "Огонь" }],
  "Наследие фей": [{ target: "save.all", op: "note", value: "Преимущество против очарования" }],
  Храбрый: [{ target: "save.all", op: "note", value: "Преимущество против испуга" }],
  "Гномья хитрость": [
    { target: "save.int", op: "note", value: "Преимущество против магии" },
    { target: "save.wis", op: "note", value: "Преимущество против магии" },
    { target: "save.cha", op: "note", value: "Преимущество против магии" },
  ],
};

function addProf(list: ProfEntry[], name: string, source: string) {
  if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
  list.push({ id: newId("pf"), name, source });
}

export function applyRacePreset(doc: CharacterDoc, p: RacePreset): void {
  const source = `Раса: ${p.name}`;
  doc.info.race = p.name;
  doc.info.size = p.size;
  doc.combat.speed.walk = p.speed;
  const bonuses = Object.entries(p.abilities) as [Ability, number][];
  if (bonuses.length) {
    doc.features.push(
      newFeature({
        kind: "race",
        name: "Увеличение характеристик",
        source,
        effects: bonuses.map(([a, n]) => newEffect({ target: `ability.${a}.score`, op: "add", value: String(n), label: "Расовое увеличение" })),
        description: textToDoc(bonuses.map(([a, n]) => `${ABILITY_LABELS[a].full} +${n}`).join(", ")),
      }),
    );
  }
  if (p.darkvision) {
    doc.features.push(
      newFeature({
        kind: "race",
        name: "Тёмное зрение",
        source,
        effects: [newEffect({ target: "sense.darkvision", op: "set", value: String(p.darkvision), label: "Тёмное зрение" })],
        description: textToDoc(`В темноте на ${p.darkvision} футов видите как при тусклом свете, но без цветов.`),
      }),
    );
  }
  for (const t of p.traits) {
    doc.features.push(
      newFeature({
        kind: "race",
        name: t.name,
        source,
        description: textToDoc(t.text),
        effects: (TRAIT_EFFECTS[t.name] ?? []).map((e) => newEffect({ ...e, label: e.label ?? t.name })),
      }),
    );
  }
  for (const l of p.languages) addProf(doc.proficiencies.languages, l, source);
}

export function classEntryFromPreset(p: ClassPreset | null, opts: { name?: string; level: number; subclass?: string; edition?: "2014" | "2024" }): ClassEntry {
  return {
    id: newId("cl"),
    name: p?.name ?? opts.name ?? "Класс",
    preset: p?.id ?? "",
    subclass: opts.subclass ?? "",
    level: Math.max(1, Math.min(20, opts.level)),
    hitDie: p?.hitDie ?? 8,
    caster: p ? (opts.edition === "2024" && p.caster2024 ? p.caster2024 : p.caster) : "none",
    spellAbility: p?.spellAbility ?? "",
  };
}

/** Adds a class. The first class also grants saving throws and armor/weapon training. */
export function applyClassPreset(
  doc: CharacterDoc,
  p: ClassPreset,
  opts: { level: number; subclass?: string; skills?: (keyof typeof SKILLS)[] },
): ClassEntry {
  const first = doc.classes.length === 0;
  const entry = classEntryFromPreset(p, { ...opts, edition: doc.settings.edition });
  doc.classes.push(entry);
  const source = `Класс: ${p.name}`;
  if (first) {
    for (const a of p.saves) {
      doc.saves[a].prof = 1;
      doc.saves[a].source = source;
    }
    for (const a of p.armor) addProf(doc.proficiencies.armor, a, source);
    for (const w of p.weapons) addProf(doc.proficiencies.weapons, w, source);
  }
  for (const s of opts.skills ?? []) {
    if (doc.skills[s].prof < 1) {
      doc.skills[s].prof = 1;
      doc.skills[s].source = source;
    }
  }
  return entry;
}

export function applyBackgroundPreset(doc: CharacterDoc, p: BackgroundPreset): void {
  const source = `Предыстория: ${p.name}`;
  doc.info.background = p.name;
  for (const s of p.skills) {
    if (doc.skills[s].prof < 1) {
      doc.skills[s].prof = 1;
      doc.skills[s].source = source;
    }
  }
  for (const t of p.tools) addProf(doc.proficiencies.tools, t, source);
  if (p.languages) addProf(doc.proficiencies.languages, `Языки на выбор: ${p.languages}`, source);
}
