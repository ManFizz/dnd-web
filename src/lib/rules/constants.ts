// Static rule data and Russian labels used across the engine and the UI.

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, { full: string; short: string; en: string }> = {
  str: { full: "Сила", short: "СИЛ", en: "STR" },
  dex: { full: "Ловкость", short: "ЛОВ", en: "DEX" },
  con: { full: "Телосложение", short: "ТЕЛ", en: "CON" },
  int: { full: "Интеллект", short: "ИНТ", en: "INT" },
  wis: { full: "Мудрость", short: "МДР", en: "WIS" },
  cha: { full: "Харизма", short: "ХАР", en: "CHA" },
};

export const SKILLS = {
  acrobatics: { ability: "dex", label: "Акробатика", en: "Acrobatics" },
  animalHandling: { ability: "wis", label: "Уход за животными", en: "Animal Handling" },
  arcana: { ability: "int", label: "Магия", en: "Arcana" },
  athletics: { ability: "str", label: "Атлетика", en: "Athletics" },
  deception: { ability: "cha", label: "Обман", en: "Deception" },
  history: { ability: "int", label: "История", en: "History" },
  insight: { ability: "wis", label: "Проницательность", en: "Insight" },
  intimidation: { ability: "cha", label: "Запугивание", en: "Intimidation" },
  investigation: { ability: "int", label: "Анализ", en: "Investigation" },
  medicine: { ability: "wis", label: "Медицина", en: "Medicine" },
  nature: { ability: "int", label: "Природа", en: "Nature" },
  perception: { ability: "wis", label: "Восприятие", en: "Perception" },
  performance: { ability: "cha", label: "Выступление", en: "Performance" },
  persuasion: { ability: "cha", label: "Убеждение", en: "Persuasion" },
  religion: { ability: "int", label: "Религия", en: "Religion" },
  sleightOfHand: { ability: "dex", label: "Ловкость рук", en: "Sleight of Hand" },
  stealth: { ability: "dex", label: "Скрытность", en: "Stealth" },
  survival: { ability: "wis", label: "Выживание", en: "Survival" },
} as const satisfies Record<string, { ability: Ability; label: string; en: string }>;

export type SkillId = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Skills that have a commonly used passive score shown in the sheet header. */
export const PASSIVE_SKILLS: SkillId[] = ["perception", "insight", "investigation"];

export const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;
export type Coin = (typeof COINS)[number];
export const COIN_LABELS: Record<Coin, { short: string; full: string; inGp: number }> = {
  cp: { short: "мм", full: "Медные", inGp: 0.01 },
  sp: { short: "см", full: "Серебряные", inGp: 0.1 },
  ep: { short: "эм", full: "Электрумовые", inGp: 0.5 },
  gp: { short: "зм", full: "Золотые", inGp: 1 },
  pp: { short: "пм", full: "Платиновые", inGp: 10 },
};

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

export const SPEED_TYPES = ["walk", "fly", "swim", "climb", "burrow"] as const;
export type SpeedType = (typeof SPEED_TYPES)[number];
export const SPEED_LABELS: Record<SpeedType, string> = {
  walk: "Ходьба",
  fly: "Полёт",
  swim: "Плавание",
  climb: "Лазание",
  burrow: "Копание",
};

export const SENSE_TYPES = ["darkvision", "blindsight", "tremorsense", "truesight"] as const;
export type SenseType = (typeof SENSE_TYPES)[number];
export const SENSE_LABELS: Record<SenseType, string> = {
  darkvision: "Тёмное зрение",
  blindsight: "Слепое зрение",
  tremorsense: "Чувство вибрации",
  truesight: "Истинное зрение",
};

export const DAMAGE_TYPES = [
  { id: "acid", label: "Кислота" },
  { id: "bludgeoning", label: "Дробящий" },
  { id: "cold", label: "Холод" },
  { id: "fire", label: "Огонь" },
  { id: "force", label: "Силовое поле" },
  { id: "lightning", label: "Электричество" },
  { id: "necrotic", label: "Некротическая энергия" },
  { id: "piercing", label: "Колющий" },
  { id: "poison", label: "Яд" },
  { id: "psychic", label: "Психическая энергия" },
  { id: "radiant", label: "Излучение" },
  { id: "slashing", label: "Рубящий" },
  { id: "thunder", label: "Звук" },
  { id: "nonmagical", label: "Немагическое оружие" },
] as const;

export function damageTypeLabel(id: string): string {
  return DAMAGE_TYPES.find((d) => d.id === id)?.label ?? id;
}

export const ALIGNMENTS = [
  "Законно-добрый",
  "Нейтрально-добрый",
  "Хаотично-добрый",
  "Законно-нейтральный",
  "Нейтральный",
  "Хаотично-нейтральный",
  "Законно-злой",
  "Нейтрально-злой",
  "Хаотично-злой",
  "Без мировоззрения",
];

export const SPELL_SCHOOLS = [
  "вызов",
  "воплощение",
  "иллюзия",
  "некромантия",
  "ограждение",
  "преобразование",
  "прорицание",
  "очарование",
];

export const REST_KINDS = ["none", "short", "long", "dawn"] as const;
export type RestKind = (typeof REST_KINDS)[number];
export const REST_LABELS: Record<RestKind, string> = {
  none: "Вручную",
  short: "Короткий отдых",
  long: "Длинный отдых",
  dawn: "На рассвете",
};

export const BODY_PARTS = [
  { id: "head", label: "Голова" },
  { id: "eyes", label: "Глаза" },
  { id: "mouth", label: "Пасть" },
  { id: "skin", label: "Кожа" },
  { id: "torso", label: "Торс" },
  { id: "arms", label: "Руки" },
  { id: "hands", label: "Кисти" },
  { id: "legs", label: "Ноги" },
  { id: "tail", label: "Хвост" },
  { id: "wings", label: "Крылья" },
  { id: "other", label: "Другое" },
] as const;

export function bodyPartLabel(id: string): string {
  return BODY_PARTS.find((p) => p.id === id)?.label ?? (id || "Другое");
}

/** XP needed to reach each level (index = level). */
export const XP_BY_LEVEL = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
];

export function proficiencyForLevel(level: number): number {
  const l = Math.max(1, Math.min(30, Math.floor(level)));
  return Math.floor((l - 1) / 4) + 2;
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "+0";
}
