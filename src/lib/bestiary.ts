import { z } from "zod";
import type { RichDoc } from "@/lib/rules/richtext";
import { RichDocSchema } from "@/lib/rules/schema";

// Bestiary: creature sizes and types, challenge ratings, the creature shape
// shared by the dnd.su parser, the upload format and the API.

export { CREATURE_TYPES, formatCr, normalizeType, parseCr, SIZE_LABELS, SIZES, sizeFromRu, type Size } from "./creatures";
import { SIZES, type Size } from "./creatures";

export const AbilitiesSchema = z.object({
  str: z.number().int().min(0).max(40),
  dex: z.number().int().min(0).max(40),
  con: z.number().int().min(0).max(40),
  int: z.number().int().min(0).max(40),
  wis: z.number().int().min(0).max(40),
  cha: z.number().int().min(0).max(40),
});
export type Abilities = z.infer<typeof AbilitiesSchema>;

export const CREATURE_SOURCES = ["dndsu", "dndsu-homebrew", "custom"] as const;

/** A creature as the parser and the upload file give it. */
export const ParsedCreatureSchema = z.object({
  source: z.enum(["dndsu", "dndsu-homebrew"]),
  externalId: z.string().min(1).max(40),
  url: z.string().max(500).default(""),
  nameRu: z.string().min(1).max(300),
  nameEn: z.string().max(300).default(""),
  size: z.enum(SIZES).or(z.literal("")).default(""),
  type: z.string().max(100).default(""),
  alignment: z.string().max(200).default(""),
  cr: z.number().min(0).max(30),
  ac: z.number().int().min(0).max(50).default(10),
  hp: z.number().int().min(0).max(10000).default(1),
  hpFormula: z.string().max(100).default(""),
  speed: z.string().max(300).default(""),
  abilities: AbilitiesSchema.nullable().default(null),
  sourceBook: z.string().max(200).default(""),
  statblock: RichDocSchema,
});
export type ParsedCreature = z.infer<typeof ParsedCreatureSchema>;

export const BestiaryFileSchema = z.union([
  z.object({ format: z.literal("dnd-web-bestiary").optional(), creatures: z.array(z.unknown()).max(10000) }),
  z.array(z.unknown()).max(10000),
]);

/** A GM's own creature. */
export const CustomCreatureSchema = z.object({
  nameRu: z.string().trim().min(1, "Нужно имя").max(300),
  nameEn: z.string().max(300).default(""),
  size: z.enum(SIZES),
  type: z.string().trim().min(1, "Нужен тип").max(100),
  alignment: z.string().max(200).default(""),
  cr: z.number().min(0).max(30),
  ac: z.number().int().min(0).max(50).default(10),
  hp: z.number().int().min(0).max(10000).default(1),
  hpFormula: z.string().max(100).default(""),
  speed: z.string().max(300).default(""),
  abilities: AbilitiesSchema.nullable().default(null),
  statblock: RichDocSchema,
});

export type CreatureRow = {
  id: string;
  source: string;
  campaignId: string | null;
  nameRu: string;
  nameEn: string;
  size: Size | "";
  type: string;
  alignment: string;
  cr: number;
  ac: number;
  hp: number;
  hpFormula: string;
  speed: string;
  abilities: Abilities | null;
  sourceBook: string;
  url: string;
  statblock?: RichDoc;
};

export function creatureSearchText(c: { nameRu: string; nameEn: string; type: string }): string {
  return `${c.nameRu} ${c.nameEn} ${c.type}`.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
