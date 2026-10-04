// Creature sizes, types and challenge ratings. No dependencies: the browser
// export script bundles this file.

export const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;
export type Size = (typeof SIZES)[number];

export const SIZE_LABELS: Record<Size, string> = {
  tiny: "Крошечный",
  small: "Маленький",
  medium: "Средний",
  large: "Большой",
  huge: "Огромный",
  gargantuan: "Громадный",
};

/** Russian size word (any gender or case ending) → size id. */
export function sizeFromRu(word: string): Size | null {
  const w = word.toLowerCase().replace(/ё/g, "е");
  if (w.startsWith("крошечн")) return "tiny";
  if (w.startsWith("маленьк")) return "small";
  if (w.startsWith("средн")) return "medium";
  if (w.startsWith("больш")) return "large";
  if (w.startsWith("огромн")) return "huge";
  if (w.startsWith("громадн")) return "gargantuan";
  return null;
}

/** Creature types of the 5e rules, as dnd.su writes them. */
export const CREATURE_TYPES = [
  "аберрация",
  "зверь",
  "небожитель",
  "конструкт",
  "дракон",
  "элементаль",
  "фея",
  "исчадие",
  "великан",
  "гуманоид",
  "чудовище",
  "слизь",
  "растение",
  "нежить",
] as const;

/** Normalizes a type phrase ("нежить (зомби)", "Исчадие") to a known type when possible. */
export function normalizeType(raw: string): string {
  const t = raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\(.*?\)/g, "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .trim();
  const known = CREATURE_TYPES.find((k) => t.startsWith(k.replace(/ё/g, "е")) || t.split(/\s+/).includes(k));
  if (known) return known;
  // Feminine/plural forms: "фей", "слизи", "растения"...
  const stem = CREATURE_TYPES.find((k) => t.startsWith(k.slice(0, Math.max(4, k.length - 2))));
  return stem ?? (t.split(/\s+/)[0] || "");
}

/** "1/8" → 0.125, "5" → 5; NaN when not a rating. */
export function parseCr(text: string): number {
  const t = text.trim();
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function formatCr(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}
