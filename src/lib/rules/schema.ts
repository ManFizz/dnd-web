import { z } from "zod";
import { ABILITIES, COINS, SIZES, SKILL_IDS, SPEED_TYPES, type Ability, type SkillId } from "./constants";
import { emptyDoc, type RichDoc } from "./richtext";

// The character document is stored as JSON in Postgres. Every field has a
// default so that older documents are upgraded transparently on parse.

export const CURRENT_SCHEMA_VERSION = 1;

const id = z.string().min(1).max(80);
const shortText = (max = 200) => z.string().max(max).default("");
const formula = z.string().max(500).default("");

export const RichDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.any()).optional(),
  })
  .transform((d) => d as RichDoc);

const richDoc = () => RichDocSchema.default(emptyDoc);

export const PROF_LEVELS = [0, 0.5, 1, 2] as const;
export const ProfLevelSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)]);
export type ProfLevel = z.infer<typeof ProfLevelSchema>;

export const RestKindSchema = z.enum(["none", "short", "long", "dawn"]);

export const EFFECT_OPS = ["add", "set", "min", "max", "adv", "dis", "grant", "note"] as const;
export const EffectOpSchema = z.enum(EFFECT_OPS);
export type EffectOp = z.infer<typeof EffectOpSchema>;

/**
 * A single modifier. Effects live on bonuses, items, features (race, class,
 * feats, mutations...) and conditions. `target` is a stat key such as
 * `ability.int.score`, `save.all`, `ac`, `spell.dc` or `resist`.
 */
export const EffectSchema = z.object({
  id,
  target: z.string().min(1).max(120),
  op: EffectOpSchema.default("add"),
  value: z.string().max(500).default(""),
  label: shortText(300),
  enabled: z.boolean().default(true),
  /** Only used by items: when the effect is active. */
  when: z.enum(["auto", "always", "equipped", "attuned"]).default("auto"),
});
export type Effect = z.infer<typeof EffectSchema>;

export const UsesSchema = z.object({
  max: z.string().max(200).default("1"),
  used: z.number().int().min(0).max(100000).default(0),
  reset: RestKindSchema.default("long"),
});
export type Uses = z.infer<typeof UsesSchema>;

export const ATTACK_ABILITIES = ["none", "str", "dex", "con", "int", "wis", "cha", "finesse", "spell"] as const;

export const AttackSchema = z.object({
  id,
  name: shortText(),
  kind: z.enum(["attack", "save", "other"]).default("attack"),
  ability: z.enum(ATTACK_ABILITIES).default("str"),
  proficient: z.boolean().default(true),
  /** Extra to-hit bonus formula (added to ability mod + proficiency). */
  bonus: formula,
  /** Damage formula, ability modifier is added automatically when addMod is set. */
  damage: formula,
  addMod: z.boolean().default(true),
  damageType: shortText(100),
  /** For saving-throw based abilities. */
  saveAbility: z.enum(["", ...ABILITIES]).default(""),
  saveDc: formula,
  range: shortText(100),
  activation: z.enum(["action", "bonus", "reaction", "free", "other"]).default("action"),
  notes: shortText(2000),
});
export type Attack = z.infer<typeof AttackSchema>;

export const FEATURE_KINDS = ["race", "class", "background", "feat", "mutation", "boon", "curse", "other"] as const;
export const FeatureKindSchema = z.enum(FEATURE_KINDS);
export type FeatureKind = z.infer<typeof FeatureKindSchema>;

export const GRANT_LOCKS = ["none", "noedit", "noremove"] as const;
export const GRANT_VISIBILITY = ["visible", "masked", "hidden"] as const;
export const GRANT_EXPIRY = ["never", "rounds", "short", "long", "days", "session"] as const;
export type GrantLock = (typeof GRANT_LOCKS)[number];
export type GrantVisibility = (typeof GRANT_VISIBILITY)[number];
export type GrantExpiry = (typeof GRANT_EXPIRY)[number];

/**
 * Marks an entry that the GM gave through a campaign grant. The Grant row on
 * the server is the source of truth; this copy lets the sheet show the lock,
 * the visibility and the timer without another request.
 */
export const GrantMarkSchema = z.object({
  id,
  campaignId: z.string().max(80).default(""),
  /** none: player may do anything; noedit: may not change it; noremove: may not remove it either. */
  lock: z.enum(GRANT_LOCKS).default("none"),
  /** masked: name shown, properties hidden ("???"); hidden: not listed at all, effects still apply. */
  visibility: z.enum(GRANT_VISIBILITY).default("visible"),
  expires: z.enum(GRANT_EXPIRY).default("never"),
  /** Rounds or long rests left for "rounds" and "days". */
  left: z.number().int().min(0).max(100000).default(0),
  /** How to get rid of it, shown to the player. */
  removal: shortText(500),
  reason: shortText(300),
  /** Cursed item: once equipped or attuned it cannot be taken off. */
  cursed: z.boolean().default(false),
  /** Curse or boon stage, 0 = first; stages = number of stages (0 = no stages). */
  stage: z.number().int().min(0).max(50).default(0),
  stages: z.number().int().min(0).max(50).default(0),
  /** When the curse acts ("при длинном отдыхе: спасбросок ТЕЛ 15"), free text. */
  triggers: shortText(500),
});
export type GrantMark = z.infer<typeof GrantMarkSchema>;

export const FeatureSchema = z.object({
  id,
  kind: FeatureKindSchema.default("other"),
  name: shortText(),
  /** Free text: "Волшебник, 2 уровень", "Черта", "Мутация от мастера"... */
  source: shortText(),
  level: z.number().int().min(0).max(30).default(0),
  active: z.boolean().default(true),
  /** Mutations: which body part it replaces and where it came from. */
  bodyPart: shortText(50),
  origin: shortText(100),
  description: richDoc(),
  effects: z.array(EffectSchema).max(200).default([]),
  uses: UsesSchema.nullable().default(null),
  attacks: z.array(AttackSchema).max(50).default([]),
  tags: z.array(z.string().max(50)).max(30).default([]),
  grant: GrantMarkSchema.nullable().default(null),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const ITEM_CATEGORIES = [
  "weapon",
  "armor",
  "shield",
  "gear",
  "consumable",
  "tool",
  "treasure",
  "magic",
  "ammo",
  "other",
] as const;
export const ItemCategorySchema = z.enum(ITEM_CATEGORIES);

export const RARITIES = ["", "common", "uncommon", "rare", "veryRare", "legendary", "artifact"] as const;

export const ArmorSchema = z.object({
  type: z.enum(["light", "medium", "heavy"]).default("light"),
  base: z.number().int().min(0).max(40).default(11),
  /** null = no cap (light armor). */
  dexCap: z.number().int().min(0).max(10).nullable().default(null),
  stealthDisadvantage: z.boolean().default(false),
  strength: z.number().int().min(0).max(30).default(0),
});
export type Armor = z.infer<typeof ArmorSchema>;

export const WeaponSchema = z.object({
  ability: z.enum(ATTACK_ABILITIES).default("str"),
  damage: z.string().max(200).default("1d4"),
  damageType: shortText(100),
  versatile: shortText(100),
  range: shortText(100),
  properties: z.array(z.string().max(60)).max(20).default([]),
  proficient: z.boolean().default(true),
  attackBonus: formula,
  damageBonus: formula,
});
export type Weapon = z.infer<typeof WeaponSchema>;

export const ItemSchema = z.object({
  id,
  name: shortText(),
  category: ItemCategorySchema.default("gear"),
  quantity: z.number().min(0).max(1_000_000).default(1),
  weight: z.number().min(0).max(100000).default(0),
  cost: shortText(100),
  rarity: z.enum(RARITIES).default(""),
  equipped: z.boolean().default(false),
  /** Item requires attunement. */
  attunement: z.boolean().default(false),
  attuned: z.boolean().default(false),
  description: richDoc(),
  effects: z.array(EffectSchema).max(200).default([]),
  armor: ArmorSchema.nullable().default(null),
  /** Shield AC bonus (category shield). */
  shieldBonus: z.number().int().min(0).max(20).default(2),
  weapon: WeaponSchema.nullable().default(null),
  charges: UsesSchema.nullable().default(null),
  attacks: z.array(AttackSchema).max(50).default([]),
  link: z.string().max(500).default(""),
  /** Where the item came from ("награда за квест"), shown in the journal. */
  origin: shortText(200),
  grant: GrantMarkSchema.nullable().default(null),
});
export type Item = z.infer<typeof ItemSchema>;

export const CounterSchema = z.object({
  id,
  name: shortText(),
  value: z.number().min(-1_000_000_000).max(1_000_000_000).default(0),
  /** Formula, empty = no maximum. */
  max: z.string().max(200).default(""),
  min: z.number().default(0),
  step: z.number().min(0).max(1_000_000).default(1),
  reset: RestKindSchema.default("none"),
  resetTo: z.enum(["max", "min"]).default("max"),
  group: shortText(100),
  color: shortText(20),
  pinned: z.boolean().default(false),
  description: shortText(2000),
  grant: GrantMarkSchema.nullable().default(null),
});
export type Counter = z.infer<typeof CounterSchema>;

export const CLASS_CASTER_TYPES = ["none", "full", "half", "halfUp", "third", "pact"] as const;

export const ClassEntrySchema = z.object({
  id,
  name: shortText(100),
  /** Preset id from tables.ts (wizard, fighter...), "" for custom classes. */
  preset: shortText(50),
  subclass: shortText(100),
  level: z.number().int().min(1).max(20).default(1),
  hitDie: z.number().int().min(4).max(20).default(8),
  caster: z.enum(CLASS_CASTER_TYPES).default("none"),
  spellAbility: z.enum(["", ...ABILITIES]).default(""),
});
export type ClassEntry = z.infer<typeof ClassEntrySchema>;

export const SpellDataSchema = z.object({
  nameRu: shortText(),
  nameEn: shortText(),
  level: z.number().int().min(0).max(9).default(0),
  school: shortText(100),
  ritual: z.boolean().default(false),
  concentration: z.boolean().default(false),
  castingTime: shortText(300),
  range: shortText(300),
  components: shortText(500),
  duration: shortText(300),
  classes: z.array(z.string().max(100)).max(40).default([]),
  description: richDoc(),
  /** Optional mechanics for quick rolls. */
  attack: z.enum(["", "melee", "ranged"]).default(""),
  save: z.enum(["", ...ABILITIES]).default(""),
  damage: z.string().max(200).default(""),
  damageType: shortText(100),
});
export type SpellData = z.infer<typeof SpellDataSchema>;

export const SpellOverrideSchema = SpellDataSchema.partial();
export type SpellOverride = z.infer<typeof SpellOverrideSchema>;

export const CharacterSpellSchema = z.object({
  id,
  /** Library spell id (Spell table). Null for spells stored only in this character. */
  spellId: z.string().max(80).nullable().default(null),
  /** Original Long Story Short spell id when the spell came from an import. */
  lssId: z.string().max(80).nullable().default(null),
  /** Cached name and level so the list renders even if the library spell is missing. */
  name: shortText(),
  level: z.number().int().min(0).max(9).default(0),
  prepared: z.boolean().default(false),
  alwaysPrepared: z.boolean().default(false),
  inBook: z.boolean().default(false),
  source: shortText(),
  /** Class whose DC and attack the spell uses (multiclass casters); "" = the main one. */
  classId: z.string().max(80).default(""),
  /** Per-character changes on top of the library spell. */
  override: SpellOverrideSchema.nullable().default(null),
  /** Full spell data for character-only spells (spellId == null). */
  custom: SpellDataSchema.nullable().default(null),
  notes: shortText(4000),
});
export type CharacterSpell = z.infer<typeof CharacterSpellSchema>;

export const ProfEntrySchema = z.object({
  id,
  name: z.string().min(1).max(150),
  source: shortText(150),
});
export type ProfEntry = z.infer<typeof ProfEntrySchema>;

export const OverrideSchema = z.object({
  value: z.number(),
  reason: z.string().min(1).max(500),
  at: z.string().max(40).default(""),
});
export type Override = z.infer<typeof OverrideSchema>;

export const NotePageSchema = z.object({
  id,
  title: shortText(),
  content: richDoc(),
});
export type NotePage = z.infer<typeof NotePageSchema>;

const abilityRecord = <T extends z.ZodType>(schema: T) =>
  z.object(Object.fromEntries(ABILITIES.map((a) => [a, schema])) as Record<Ability, T>);

const skillRecord = <T extends z.ZodType>(schema: T) =>
  z.object(Object.fromEntries(SKILL_IDS.map((s) => [s, schema])) as Record<SkillId, T>);

const AbilityScoreSchema = z.object({ base: z.number().int().min(1).max(30).default(10) });
const SaveSchema = z.object({ prof: ProfLevelSchema.default(0), source: shortText(150) });
const SkillSchema = z.object({
  prof: ProfLevelSchema.default(0),
  source: shortText(150),
  /** Ability override, "" = default ability of the skill. */
  ability: z.enum(["", ...ABILITIES]).default(""),
});

export const ConcentrationSchema = z.object({
  name: z.string().min(1).max(200),
  spellEntryId: z.string().max(80).default(""),
  startedAt: z.string().max(40).default(""),
  note: shortText(500),
});
export type Concentration = z.infer<typeof ConcentrationSchema>;

export const CharacterDocSchema = z.object({
  schemaVersion: z.number().int().default(CURRENT_SCHEMA_VERSION),
  name: z.string().max(200).default("Безымянный герой"),
  avatarUrl: z.string().max(400_000).default(""),
  info: z
    .object({
      race: shortText(100),
      background: shortText(100),
      alignment: shortText(100),
      playerName: shortText(100),
      size: z.enum(SIZES).default("medium"),
      xp: z.number().int().min(0).max(100_000_000).default(0),
      age: shortText(50),
      height: shortText(50),
      weight: shortText(50),
      eyes: shortText(50),
      skin: shortText(50),
      hair: shortText(50),
      faith: shortText(100),
    })
    .prefault({}),
  classes: z.array(ClassEntrySchema).max(20).default([]),
  abilities: abilityRecord(AbilityScoreSchema.prefault({})).prefault({}),
  saves: abilityRecord(SaveSchema.prefault({})).prefault({}),
  skills: skillRecord(SkillSchema.prefault({})).prefault({}),
  combat: z
    .object({
      hpCurrent: z.number().int().min(-10000).max(100000).default(10),
      hpTemp: z.number().int().min(0).max(100000).default(0),
      hpMaxMode: z.enum(["auto", "manual"]).default("auto"),
      hpMaxManual: z.number().int().min(0).max(100000).default(10),
      hpMaxReason: shortText(300),
      /** Spent hit dice by die size ("6", "8", ...). */
      hitDiceUsed: z.record(z.string(), z.number().int().min(0).max(100)).default({}),
      deathSuccesses: z.number().int().min(0).max(3).default(0),
      deathFailures: z.number().int().min(0).max(3).default(0),
      acMode: z.enum(["auto", "manual"]).default("auto"),
      acManual: z.number().int().min(0).max(100).default(10),
      acReason: shortText(300),
      speed: z
        .object(
          Object.fromEntries(SPEED_TYPES.map((s) => [s, z.number().int().min(0).max(10000).default(s === "walk" ? 30 : 0)])) as Record<
            (typeof SPEED_TYPES)[number],
            z.ZodDefault<z.ZodNumber>
          >,
        )
        .prefault({}),
      inspiration: z.number().int().min(0).max(99).default(0),
      /** Where each inspiration point came from, oldest first (may be shorter than the count). */
      inspirationNotes: z
        .array(z.object({ id, reason: shortText(300), at: shortText(40) }))
        .max(99)
        .default([]),
      exhaustion: z.number().int().min(0).max(10).default(0),
      conditions: z.array(z.string().max(60)).max(40).default([]),
      concentration: ConcentrationSchema.nullable().default(null),
    })
    .prefault({}),
  bonuses: z.array(EffectSchema).max(500).default([]),
  overrides: z.record(z.string().max(120), OverrideSchema).default({}),
  features: z.array(FeatureSchema).max(500).default([]),
  items: z.array(ItemSchema).max(1000).default([]),
  attacks: z.array(AttackSchema).max(200).default([]),
  counters: z.array(CounterSchema).max(200).default([]),
  coins: z
    .object(Object.fromEntries(COINS.map((c) => [c, z.number().min(0).max(1e12).default(0)])) as Record<
      (typeof COINS)[number],
      z.ZodDefault<z.ZodNumber>
    >)
    .prefault({}),
  proficiencies: z
    .object({
      armor: z.array(ProfEntrySchema).max(100).default([]),
      weapons: z.array(ProfEntrySchema).max(200).default([]),
      tools: z.array(ProfEntrySchema).max(200).default([]),
      languages: z.array(ProfEntrySchema).max(100).default([]),
      other: z.array(ProfEntrySchema).max(200).default([]),
      notes: richDoc(),
    })
    .prefault({}),
  spellcasting: z
    .object({
      ability: z.enum(["auto", ...ABILITIES]).default("auto"),
      slotsMode: z.enum(["auto", "manual"]).default("auto"),
      manualSlots: z.array(z.number().int().min(0).max(99)).length(10).default([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      slotsUsed: z.array(z.number().int().min(0).max(99)).length(10).default([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      pactUsed: z.number().int().min(0).max(20).default(0),
      spells: z.array(CharacterSpellSchema).max(1000).default([]),
      notes: richDoc(),
    })
    .prefault({}),
  /** Free-form descriptive tabs. */
  lore: z
    .object({
      race: richDoc(),
      class: richDoc(),
      background: richDoc(),
      personality: richDoc(),
      ideals: richDoc(),
      bonds: richDoc(),
      flaws: richDoc(),
      appearance: richDoc(),
      backstory: richDoc(),
      allies: richDoc(),
      quests: richDoc(),
    })
    .prefault({}),
  inventoryNotes: richDoc(),
  notes: z.array(NotePageSchema).max(100).default([]),
  settings: z
    .object({
      edition: z.enum(["2014", "2024"]).default("2014"),
      /** Mechanic keys hidden from the sheet, e.g. "skill.religion", "prof.shield", "coin.ep". */
      hidden: z.array(z.string().max(80)).max(200).default([]),
      requireReasons: z.boolean().default(true),
    })
    .prefault({}),
  meta: z
    .object({
      createdAt: shortText(40),
      importedFrom: shortText(40),
      importedAt: shortText(40),
      /** Spells from an import that could not be matched to the library yet. */
      unresolvedSpells: z
        .array(
          z.object({
            lssId: z.string().max(80),
            prepared: z.boolean().default(false),
            inBook: z.boolean().default(false),
            granted: z.boolean().default(false),
          }),
        )
        .max(1000)
        .default([]),
    })
    .prefault({}),
});

export type CharacterDoc = z.infer<typeof CharacterDocSchema>;
export type CharacterDocInput = z.input<typeof CharacterDocSchema>;

/** Parse anything into a complete, valid character document (throws on invalid data). */
export function parseCharacterDoc(raw: unknown): CharacterDoc {
  return CharacterDocSchema.parse(raw ?? {});
}

export function safeParseCharacterDoc(raw: unknown) {
  return CharacterDocSchema.safeParse(raw ?? {});
}
