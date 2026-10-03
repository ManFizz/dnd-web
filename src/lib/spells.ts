import type { RichDoc } from "@/lib/rules/richtext";
import type { CharacterSpell, SpellData, SpellOverride } from "@/lib/rules/schema";

// Shapes shared by the spell API and the UI.

export type LibrarySpell = {
  id: string;
  source: string;
  ownerId: string | null;
  nameRu: string;
  nameEn: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  classes: string[];
  subclasses: string[];
  sourceBook: string;
  url: string;
  description?: RichDoc;
  mechanics?: Partial<Pick<SpellData, "attack" | "save" | "damage" | "damageType">> | null;
};

export const SOURCE_LABELS: Record<string, string> = {
  dndsu: "dnd.su",
  "dndsu-homebrew": "dnd.su (хоумбрю)",
  "next-dndsu": "dnd.su 2024",
  custom: "Своё",
};

export function spellDisplayName(s: { nameRu: string; nameEn?: string }): string {
  return s.nameEn ? `${s.nameRu} [${s.nameEn}]` : s.nameRu;
}

export function libraryToSpellData(s: LibrarySpell): SpellData {
  return {
    nameRu: s.nameRu,
    nameEn: s.nameEn,
    level: s.level,
    school: s.school,
    ritual: s.ritual,
    concentration: s.concentration,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    classes: s.classes,
    description: s.description ?? { type: "doc", content: [{ type: "paragraph" }] },
    attack: s.mechanics?.attack ?? "",
    save: s.mechanics?.save ?? "",
    damage: s.mechanics?.damage ?? "",
    damageType: s.mechanics?.damageType ?? "",
  };
}

/** Effective spell data for a character entry: library spell + per-character override. */
export function resolveCharacterSpell(entry: CharacterSpell, library: Map<string, LibrarySpell>): {
  data: SpellData | null;
  missing: boolean;
  overridden: (keyof SpellOverride)[];
} {
  let base: SpellData | null = null;
  if (entry.custom) base = entry.custom;
  else if (entry.spellId) {
    const lib = library.get(entry.spellId);
    if (lib) base = libraryToSpellData(lib);
  }
  if (!base) return { data: null, missing: true, overridden: [] };
  const override = entry.override ?? {};
  const overridden = (Object.keys(override) as (keyof SpellOverride)[]).filter((k) => override[k] !== undefined);
  return { data: { ...base, ...override } as SpellData, missing: false, overridden };
}

export const normalizeSpellName = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** "Огненный шар [Fireball]" -> both names. */
export function splitSpellTitle(title: string): { ru: string; en: string } {
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(title.trim());
  return m ? { ru: m[1].trim(), en: m[2].trim() } : { ru: title.trim(), en: "" };
}
