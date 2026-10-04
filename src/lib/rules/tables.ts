import type { Ability, SkillId } from "./constants";
import type { ClassEntry } from "./schema";

/** Spell slots by caster level for full casters and multiclass casters (index 0 = 1st level slots). */
export const SLOTS_BY_CASTER_LEVEL: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Warlock pact magic: [slot count, slot level] by warlock level. */
export const PACT_SLOTS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

export function casterLevelContribution(c: Pick<ClassEntry, "caster" | "level">, multiclass: boolean): number {
  switch (c.caster) {
    case "full":
      return c.level;
    case "half":
      // 2014 paladins and rangers get spells from level 2.
      return multiclass ? Math.floor(c.level / 2) : c.level >= 2 ? Math.ceil(c.level / 2) : 0;
    case "halfUp":
      return Math.ceil(c.level / 2);
    case "third":
      return multiclass ? Math.floor(c.level / 3) : c.level >= 3 ? Math.ceil(c.level / 3) : 0;
    default:
      return 0;
  }
}

/** Combined spellcaster level used for the multiclass slot table (pact magic excluded). */
export function spellcasterLevel(classes: Pick<ClassEntry, "caster" | "level">[]): number {
  const casters = classes.filter((c) => c.caster !== "none" && c.caster !== "pact");
  const multiclass = casters.length > 1;
  return Math.min(
    20,
    casters.reduce((acc, c) => acc + casterLevelContribution(c, multiclass), 0),
  );
}

/** Slot maximums for levels 1..9 (array index = spell level, index 0 unused). */
export function computeSlots(classes: Pick<ClassEntry, "caster" | "level">[]): number[] {
  const row = SLOTS_BY_CASTER_LEVEL[spellcasterLevel(classes)] ?? [];
  return [0, ...Array.from({ length: 9 }, (_, i) => row[i] ?? 0)];
}

export function computePact(classes: Pick<ClassEntry, "caster" | "level">[]): { count: number; level: number } {
  const warlockLevel = classes.filter((c) => c.caster === "pact").reduce((acc, c) => acc + c.level, 0);
  const [count, level] = PACT_SLOTS[Math.min(20, warlockLevel)] ?? [0, 0];
  return { count, level };
}

export function cantripTier(level: number): number {
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 5) return 2;
  return 1;
}

export type ClassPreset = {
  id: string;
  name: string;
  aliases: string[];
  hitDie: number;
  saves: Ability[];
  caster: ClassEntry["caster"];
  caster2024?: ClassEntry["caster"];
  spellAbility: Ability | "";
  armor: string[];
  weapons: string[];
  skillChoices: { count: number; from: SkillId[] | "any" };
};

export const ARMOR_PROFS = ["Лёгкие доспехи", "Средние доспехи", "Тяжёлые доспехи", "Щиты"];
export const WEAPON_PROFS = ["Простое оружие", "Воинское оружие"];

export const CLASS_PRESETS: ClassPreset[] = [
  {
    id: "artificer",
    name: "Изобретатель",
    aliases: ["artificer", "изобретатель"],
    hitDie: 8,
    saves: ["con", "int"],
    caster: "halfUp",
    spellAbility: "int",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Щиты"],
    weapons: ["Простое оружие"],
    skillChoices: { count: 2, from: ["arcana", "history", "investigation", "medicine", "nature", "perception", "sleightOfHand"] },
  },
  {
    id: "barbarian",
    name: "Варвар",
    aliases: ["barbarian", "варвар"],
    hitDie: 12,
    saves: ["str", "con"],
    caster: "none",
    spellAbility: "",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Щиты"],
    weapons: ["Простое оружие", "Воинское оружие"],
    skillChoices: { count: 2, from: ["animalHandling", "athletics", "intimidation", "nature", "perception", "survival"] },
  },
  {
    id: "bard",
    name: "Бард",
    aliases: ["bard", "бард"],
    hitDie: 8,
    saves: ["dex", "cha"],
    caster: "full",
    spellAbility: "cha",
    armor: ["Лёгкие доспехи"],
    weapons: ["Простое оружие"],
    skillChoices: { count: 3, from: "any" },
  },
  {
    id: "cleric",
    name: "Жрец",
    aliases: ["cleric", "жрец", "клирик"],
    hitDie: 8,
    saves: ["wis", "cha"],
    caster: "full",
    spellAbility: "wis",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Щиты"],
    weapons: ["Простое оружие"],
    skillChoices: { count: 2, from: ["history", "insight", "medicine", "persuasion", "religion"] },
  },
  {
    id: "druid",
    name: "Друид",
    aliases: ["druid", "друид"],
    hitDie: 8,
    saves: ["int", "wis"],
    caster: "full",
    spellAbility: "wis",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Щиты"],
    weapons: ["Простое оружие"],
    skillChoices: {
      count: 2,
      from: ["arcana", "animalHandling", "insight", "medicine", "nature", "perception", "religion", "survival"],
    },
  },
  {
    id: "fighter",
    name: "Воин",
    aliases: ["fighter", "воин"],
    hitDie: 10,
    saves: ["str", "con"],
    caster: "none",
    spellAbility: "",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Тяжёлые доспехи", "Щиты"],
    weapons: ["Простое оружие", "Воинское оружие"],
    skillChoices: {
      count: 2,
      from: ["acrobatics", "animalHandling", "athletics", "history", "insight", "intimidation", "perception", "survival"],
    },
  },
  {
    id: "monk",
    name: "Монах",
    aliases: ["monk", "монах"],
    hitDie: 8,
    saves: ["str", "dex"],
    caster: "none",
    spellAbility: "",
    armor: [],
    weapons: ["Простое оружие"],
    skillChoices: { count: 2, from: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"] },
  },
  {
    id: "paladin",
    name: "Паладин",
    aliases: ["paladin", "паладин"],
    hitDie: 10,
    saves: ["wis", "cha"],
    caster: "half",
    caster2024: "halfUp",
    spellAbility: "cha",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Тяжёлые доспехи", "Щиты"],
    weapons: ["Простое оружие", "Воинское оружие"],
    skillChoices: { count: 2, from: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"] },
  },
  {
    id: "ranger",
    name: "Следопыт",
    aliases: ["ranger", "следопыт"],
    hitDie: 10,
    saves: ["str", "dex"],
    caster: "half",
    caster2024: "halfUp",
    spellAbility: "wis",
    armor: ["Лёгкие доспехи", "Средние доспехи", "Щиты"],
    weapons: ["Простое оружие", "Воинское оружие"],
    skillChoices: {
      count: 3,
      from: ["animalHandling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
    },
  },
  {
    id: "rogue",
    name: "Плут",
    aliases: ["rogue", "плут"],
    hitDie: 8,
    saves: ["dex", "int"],
    caster: "none",
    spellAbility: "",
    armor: ["Лёгкие доспехи"],
    weapons: ["Простое оружие"],
    skillChoices: {
      count: 4,
      from: [
        "acrobatics",
        "athletics",
        "deception",
        "insight",
        "intimidation",
        "investigation",
        "perception",
        "performance",
        "persuasion",
        "sleightOfHand",
        "stealth",
      ],
    },
  },
  {
    id: "sorcerer",
    name: "Чародей",
    aliases: ["sorcerer", "чародей"],
    hitDie: 6,
    saves: ["con", "cha"],
    caster: "full",
    spellAbility: "cha",
    armor: [],
    weapons: ["Простое оружие"],
    skillChoices: { count: 2, from: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"] },
  },
  {
    id: "warlock",
    name: "Колдун",
    aliases: ["warlock", "колдун"],
    hitDie: 8,
    saves: ["wis", "cha"],
    caster: "pact",
    spellAbility: "cha",
    armor: ["Лёгкие доспехи"],
    weapons: ["Простое оружие"],
    skillChoices: {
      count: 2,
      from: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"],
    },
  },
  {
    id: "wizard",
    name: "Волшебник",
    aliases: ["wizard", "волшебник", "маг"],
    hitDie: 6,
    saves: ["int", "wis"],
    caster: "full",
    spellAbility: "int",
    armor: [],
    weapons: ["Простое оружие"],
    skillChoices: { count: 2, from: ["arcana", "history", "insight", "investigation", "medicine", "religion"] },
  },
];

export function findClassPreset(nameOrId: string): ClassPreset | undefined {
  const key = nameOrId.trim().toLowerCase();
  if (!key) return undefined;
  return CLASS_PRESETS.find((p) => p.id === key || p.aliases.includes(key) || p.name.toLowerCase() === key);
}

export type RacePreset = {
  id: string;
  name: string;
  size: "small" | "medium";
  speed: number;
  darkvision: number;
  /** Fixed ability bonuses (2014 style). */
  abilities: Partial<Record<Ability, number>>;
  languages: string[];
  traits: { name: string; text: string }[];
};

// Mechanics follow the SRD 5.1 (CC-BY-4.0); descriptions are short summaries.
export const RACE_PRESETS: RacePreset[] = [
  {
    id: "human",
    name: "Человек",
    size: "medium",
    speed: 30,
    darkvision: 0,
    abilities: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    languages: ["Общий", "Один язык на выбор"],
    traits: [],
  },
  {
    id: "dwarf",
    name: "Дварф",
    size: "medium",
    speed: 25,
    darkvision: 60,
    abilities: { con: 2 },
    languages: ["Общий", "Дварфийский"],
    traits: [
      { name: "Дварфийская устойчивость", text: "Преимущество на спасброски от яда и сопротивление урону ядом." },
      { name: "Знание камня", text: "Двойной бонус мастерства к проверкам Истории, связанным с каменной кладкой." },
    ],
  },
  {
    id: "elf",
    name: "Эльф",
    size: "medium",
    speed: 30,
    darkvision: 60,
    abilities: { dex: 2 },
    languages: ["Общий", "Эльфийский"],
    traits: [
      { name: "Наследие фей", text: "Преимущество на спасброски от очарования, магия не может вас усыпить." },
      { name: "Транс", text: "Вместо сна вы медитируете 4 часа." },
    ],
  },
  {
    id: "halfling",
    name: "Полурослик",
    size: "small",
    speed: 25,
    darkvision: 0,
    abilities: { dex: 2 },
    languages: ["Общий", "Язык полуросликов"],
    traits: [
      { name: "Везучий", text: "Выпавшую «1» на к20 при атаке, проверке или спасброске можно перебросить." },
      { name: "Храбрый", text: "Преимущество на спасброски от испуга." },
    ],
  },
  {
    id: "dragonborn",
    name: "Драконорождённый",
    size: "medium",
    speed: 30,
    darkvision: 0,
    abilities: { str: 2, cha: 1 },
    languages: ["Общий", "Драконий"],
    traits: [{ name: "Оружие дыхания", text: "Выдох стихии своего предка, урон растёт с уровнем." }],
  },
  {
    id: "gnome",
    name: "Гном",
    size: "small",
    speed: 25,
    darkvision: 60,
    abilities: { int: 2 },
    languages: ["Общий", "Гномий"],
    traits: [{ name: "Гномья хитрость", text: "Преимущество на спасброски Интеллекта, Мудрости и Харизмы от магии." }],
  },
  {
    id: "half-elf",
    name: "Полуэльф",
    size: "medium",
    speed: 30,
    darkvision: 60,
    abilities: { cha: 2 },
    languages: ["Общий", "Эльфийский", "Один язык на выбор"],
    traits: [{ name: "Наследие фей", text: "Преимущество на спасброски от очарования, магия не может вас усыпить." }],
  },
  {
    id: "half-orc",
    name: "Полуорк",
    size: "medium",
    speed: 30,
    darkvision: 60,
    abilities: { str: 2, con: 1 },
    languages: ["Общий", "Орочий"],
    traits: [{ name: "Непоколебимая стойкость", text: "Раз в длинный отдых при падении до 0 хитов остаётесь с 1 хитом." }],
  },
  {
    id: "tiefling",
    name: "Тифлинг",
    size: "medium",
    speed: 30,
    darkvision: 60,
    abilities: { cha: 2, int: 1 },
    languages: ["Общий", "Инфернальный"],
    traits: [{ name: "Адское сопротивление", text: "Сопротивление урону огнём." }],
  },
];

export type BackgroundPreset = { id: string; name: string; skills: SkillId[]; tools: string[]; languages: number };

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "acolyte", name: "Прислужник", skills: ["insight", "religion"], tools: [], languages: 2 },
  { id: "criminal", name: "Преступник", skills: ["deception", "stealth"], tools: ["Воровские инструменты"], languages: 0 },
  { id: "folk-hero", name: "Народный герой", skills: ["animalHandling", "survival"], tools: ["Инструменты ремесленника"], languages: 0 },
  { id: "noble", name: "Благородный", skills: ["history", "persuasion"], tools: ["Игровой набор"], languages: 1 },
  { id: "sage", name: "Мудрец", skills: ["arcana", "history"], tools: [], languages: 2 },
  { id: "soldier", name: "Солдат", skills: ["athletics", "intimidation"], tools: ["Игровой набор"], languages: 0 },
  { id: "guild-artisan", name: "Гильдейский ремесленник", skills: ["insight", "persuasion"], tools: ["Инструменты ремесленника"], languages: 1 },
  { id: "hermit", name: "Отшельник", skills: ["medicine", "religion"], tools: ["Набор травника"], languages: 1 },
  { id: "outlander", name: "Чужеземец", skills: ["athletics", "survival"], tools: ["Музыкальный инструмент"], languages: 1 },
  { id: "urchin", name: "Беспризорник", skills: ["sleightOfHand", "stealth"], tools: ["Набор для грима", "Воровские инструменты"], languages: 0 },
  { id: "charlatan", name: "Шарлатан", skills: ["deception", "sleightOfHand"], tools: ["Набор для грима", "Набор для фальсификации"], languages: 0 },
  { id: "entertainer", name: "Артист", skills: ["acrobatics", "performance"], tools: ["Набор для грима", "Музыкальный инструмент"], languages: 0 },
  { id: "sailor", name: "Моряк", skills: ["athletics", "perception"], tools: ["Инструменты навигатора", "Водный транспорт"], languages: 0 },
];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Point buy cost by score (27 points budget). */
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
