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

// \b is ASCII-only in JS, so the end of a Cyrillic word is checked with a lookahead.
const HEADING = new RegExp(
  String.raw`^(?:(заговоры|cantrips?)|(\d)\s*(?:-?[йя])?\s*(?:уровень|ур\.?|круг|level)|(?:уровень|круг|level)(?:\s*(\d))?|(ячейки|slots?))(?![\p{L}\p{N}])`,
  "iu",
);

export type SpellListEntry = { name: string; level: number | null };

/**
 * Heading lines like "Заговоры", "3 уровень" or "Круг 2 (3 ячейки)": the level they open, null
 * for headings without one, undefined for anything else. "Круг смерти" is a spell, not a heading.
 */
function headingLevel(line: string): number | null | undefined {
  const m = HEADING.exec(line);
  if (!m) return undefined;
  if (m[4]) return null;
  const rest = line.slice(m[0].length).trim();
  if (/\p{L}/u.test(rest) && !/^[(:—–\-|/,]/.test(rest)) return undefined;
  if (m[1]) return 0;
  const n = m[2] ?? m[3];
  return n ? Number(n) : null;
}

/**
 * Spell names from a pasted list or notes, one per line. Headings ("Заговоры", "3 уровень")
 * set the level of the names below them; bullets and numbering are dropped, and a title
 * wrapped inside "[...]" is joined back ("Прикосновение вампира [Vampiric" + "Touch]").
 */
export function parseSpellList(text: string): SpellListEntry[] {
  const out: SpellListEntry[] = [];
  const seen = new Set<string>();
  let level: number | null = null;
  const push = (raw: string) => {
    const line = raw.replace(/^[\s•*\-–—\d.)]+/, "").trim();
    if (!line || line.length > 80 || line.endsWith(":")) return;
    const key = normalizeSpellName(line);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: line, level });
  };
  let pending = "";
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (pending) {
      pending = `${pending} ${trimmed}`;
      if (trimmed.includes("]") || pending.length > 120) {
        push(pending);
        pending = "";
      }
      continue;
    }
    const heading = headingLevel(trimmed) ?? headingLevel(trimmed.replace(/^[\s•*\-–—\d.)]+/, ""));
    if (heading !== undefined) {
      if (heading !== null) level = heading;
    } else if (trimmed.includes("[") && !trimmed.includes("]")) {
      pending = trimmed;
    } else {
      push(trimmed);
    }
  }
  if (pending) push(pending);
  return out;
}

/** Spell names from free text such as spell notes. */
export function spellNamesFromText(text: string): string[] {
  return parseSpellList(text).map((e) => e.name);
}

/** The reverse of parseSpellList: names grouped under level headings. */
export function formatSpellList(entries: SpellListEntry[]): string {
  const lines: string[] = [];
  let level: number | null = null;
  for (const e of [...entries].sort((a, b) => (a.level ?? -1) - (b.level ?? -1))) {
    if (e.level !== null && e.level !== level) lines.push(e.level === 0 ? "Заговоры" : `${e.level} уровень`);
    level = e.level;
    lines.push(e.name);
  }
  return lines.join("\n");
}

type MatchableSpell = { nameRu: string; nameEn: string; ownerId: string | null; source: string };

/**
 * Finds library spells by the names people type. Exact Russian or English names win; otherwise a
 * name that is a whole-word part of a library name matches ("Жуткий смех" finds "Жуткий смех
 * Таши"). Shared spells beat homebrew copies, and the character's edition picks between dnd.su
 * versions.
 */
export function spellMatcher<T extends MatchableSpell>(rows: T[], edition: "2014" | "2024" = "2014"): (name: string) => T | null {
  const preferred = edition === "2024" ? "next-dndsu" : "dndsu";
  const rank = (r: T) => (r.ownerId ? 2 : 0) + (r.source === preferred ? 0 : 1);
  const keyed = rows.map((r) => ({ row: r, ru: normalizeSpellName(r.nameRu), en: normalizeSpellName(r.nameEn) }));
  const exact = new Map<string, T>();
  for (const { row, ru, en } of keyed) {
    for (const key of [ru, en]) {
      if (!key) continue;
      const prev = exact.get(key);
      if (!prev || rank(row) < rank(prev)) exact.set(key, row);
    }
  }
  const partial = (needle: string, field: "ru" | "en"): T | null => {
    if (needle.length < 5) return null;
    let best: { row: T; score: number } | null = null;
    for (const k of keyed) {
      const hay = k[field];
      if (!hay || !` ${hay} `.includes(` ${needle} `)) continue;
      const score = (hay.length - needle.length) * 10 + rank(k.row);
      if (!best || score < best.score) best = { row: k.row, score };
    }
    return best?.row ?? null;
  };
  return (name) => {
    const { ru, en } = splitSpellTitle(name);
    const nRu = normalizeSpellName(ru);
    const nEn = normalizeSpellName(en);
    return (nEn && exact.get(nEn)) || (nRu && exact.get(nRu)) || partial(nEn, "en") || partial(nRu, "ru") || null;
  };
}
