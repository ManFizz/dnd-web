import type { Feature, Item } from "./schema";

// Russian labels for enums used across the UI.

export const ITEM_CATEGORY_LABELS: Record<Item["category"], string> = {
  weapon: "Оружие",
  armor: "Доспех",
  shield: "Щит",
  gear: "Снаряжение",
  consumable: "Расходуемое",
  tool: "Инструмент",
  treasure: "Сокровище",
  magic: "Чудесный предмет",
  ammo: "Боеприпасы",
  other: "Прочее",
};

export const RARITY_LABELS: Record<Item["rarity"], string> = {
  "": "—",
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  veryRare: "Очень редкий",
  legendary: "Легендарный",
  artifact: "Артефакт",
};

export const RARITY_TONES: Record<Item["rarity"], "neutral" | "good" | "info" | "magic" | "accent" | "danger"> = {
  "": "neutral",
  common: "neutral",
  uncommon: "good",
  rare: "info",
  veryRare: "magic",
  legendary: "accent",
  artifact: "danger",
};

export const FEATURE_KIND_OPTIONS: { value: Feature["kind"]; label: string }[] = [
  { value: "race", label: "Раса" },
  { value: "class", label: "Класс" },
  { value: "background", label: "Предыстория" },
  { value: "feat", label: "Черта" },
  { value: "mutation", label: "Мутация" },
  { value: "boon", label: "Дар / благословение" },
  { value: "other", label: "Другое" },
];

export const ARMOR_TYPE_LABELS = { light: "Лёгкий", medium: "Средний", heavy: "Тяжёлый" } as const;

export const PROF_LEVEL_LABELS: Record<string, string> = {
  "0": "Нет",
  "0.5": "Половина",
  "1": "Владение",
  "2": "Экспертиза",
};
