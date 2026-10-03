import { z } from "zod";
import { RichDocSchema } from "@/lib/rules/schema";
import type { RichDoc, RichNode } from "@/lib/rules/richtext";
import type { ParsedSpell } from "./parse";
import { classifySpellUrl } from "./parse";

// Formats accepted by the spell upload endpoint.

export const ParsedSpellSchema = z.object({
  source: z.enum(["dndsu", "dndsu-homebrew", "next-dndsu"]),
  externalId: z.string().min(1).max(40),
  url: z.string().max(500).default(""),
  nameRu: z.string().min(1).max(300),
  nameEn: z.string().max(300).default(""),
  level: z.number().int().min(0).max(9),
  school: z.string().max(100).default(""),
  ritual: z.boolean().default(false),
  concentration: z.boolean().default(false),
  castingTime: z.string().max(500).default(""),
  range: z.string().max(300).default(""),
  components: z.string().max(1000).default(""),
  duration: z.string().max(300).default(""),
  classes: z.array(z.string().max(100)).max(40).default([]),
  subclasses: z.array(z.string().max(200)).max(80).default([]),
  sourceBook: z.string().max(200).default(""),
  description: RichDocSchema,
});

/** Our own export: { format: "dnd-web-spells", spells: ParsedSpell[] } or a bare array. */
export const SpellFileSchema = z.union([
  z.object({ format: z.literal("dnd-web-spells").optional(), spells: z.array(z.unknown()).max(5000) }),
  z.array(z.unknown()).max(5000),
  z.object({ records: z.record(z.string(), z.unknown()) }),
]);

const textParagraph = (text: string): RichNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined });

type SpellbookBlock = { type?: string; text?: string };

/**
 * Records produced by the open source "spellbook_builder" crawler for dnd.su
 * (fields name_ru, content_blocks, source_url...).
 */
export function fromSpellbookRecord(r: Record<string, unknown>): ParsedSpell | null {
  const url = typeof r.source_url === "string" ? r.source_url : "";
  const where = classifySpellUrl(url);
  const id = where?.id ?? (typeof r.numeric_id === "number" ? String(r.numeric_id) : "");
  const nameRu = typeof r.name_ru === "string" ? r.name_ru : "";
  if (!id || !nameRu) return null;
  const blocks = Array.isArray(r.content_blocks) ? (r.content_blocks as SpellbookBlock[]) : [];
  const content: RichNode[] = blocks.map((b) => {
    const text = (b.text ?? "").trim();
    if (b.type === "heading") return { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }] };
    if (b.type === "list") {
      return {
        type: "bulletList",
        content: text
          .split("\n")
          .map((l) => l.replace(/^(•|\d+\.)\s*/, "").trim())
          .filter(Boolean)
          .map((l) => ({ type: "listItem", content: [textParagraph(l)] })),
      };
    }
    return textParagraph(text);
  });
  if (!content.length && typeof r.description === "string") content.push(...r.description.split("\n").map(textParagraph));
  const description: RichDoc = { type: "doc", content: content.length ? content : [textParagraph("")] };
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const arr = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  return {
    source: where?.source ?? "dndsu",
    externalId: id,
    url,
    nameRu,
    nameEn: str("name_en"),
    level: typeof r.level === "number" ? r.level : 0,
    school: str("school"),
    ritual: r.ritual === true,
    concentration: r.concentration === true,
    castingTime: str("casting_time"),
    range: str("range"),
    components: str("components"),
    duration: str("duration"),
    classes: arr("classes"),
    subclasses: arr("subclasses"),
    sourceBook: str("source_book"),
    description,
  };
}

/** Normalize any supported upload into validated spells plus a list of rejected entries. */
export function normalizeSpellUpload(raw: unknown): { spells: ParsedSpell[]; rejected: number } {
  const parsed = SpellFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Файл не похож на список заклинаний");
  let entries: unknown[];
  let legacy = false;
  if (Array.isArray(parsed.data)) entries = parsed.data;
  else if ("records" in parsed.data) {
    entries = Object.values(parsed.data.records);
    legacy = true;
  } else entries = parsed.data.spells;
  const spells: ParsedSpell[] = [];
  let rejected = 0;
  for (const e of entries) {
    const candidate = legacy && e && typeof e === "object" ? fromSpellbookRecord(e as Record<string, unknown>) : e;
    const r = ParsedSpellSchema.safeParse(candidate);
    if (r.success) spells.push(r.data as ParsedSpell);
    else rejected++;
  }
  return { spells, rejected };
}
