import { CONDITIONS } from "./conditions";
import { DAMAGE_TYPES } from "./constants";
import { ARMOR_PROFS, WEAPON_PROFS } from "./tables";

// Suggestions for free-text fields (proficiencies, grants). Players can always type their own.

export const LANGUAGES = [
  "Общий",
  "Дварфийский",
  "Эльфийский",
  "Великаний",
  "Гномий",
  "Гоблинский",
  "Язык полуросликов",
  "Орочий",
  "Язык Бездны",
  "Небесный",
  "Драконий",
  "Глубинная речь",
  "Инфернальный",
  "Первичный",
  "Сильван",
  "Подземный",
  "Воровской жаргон",
  "Друидический",
];

export const TOOLS = [
  "Воровские инструменты",
  "Набор травника",
  "Набор для грима",
  "Набор для фальсификации",
  "Набор отравителя",
  "Инструменты алхимика",
  "Инструменты кузнеца",
  "Инструменты каллиграфа",
  "Инструменты картографа",
  "Инструменты навигатора",
  "Инструменты ремесленника",
  "Музыкальный инструмент",
  "Игровой набор",
  "Транспорт (наземный)",
  "Транспорт (водный)",
];

export const WEAPONS = [
  ...WEAPON_PROFS,
  "Длинный меч",
  "Короткий меч",
  "Рапира",
  "Кинжал",
  "Длинный лук",
  "Короткий лук",
  "Лёгкий арбалет",
  "Ручной арбалет",
  "Боевой топор",
  "Боевой молот",
  "Посох",
  "Дротик",
  "Праща",
  "Скимитар",
];

/** Suggested values for "grant" effect targets. */
export function grantSuggestions(target: string): string[] {
  switch (target) {
    case "resist":
    case "immune":
    case "vulnerable":
      return DAMAGE_TYPES.map((d) => d.label);
    case "condimmune":
      return [...CONDITIONS.map((c) => c.label), "Истощение"];
    case "prof.armor":
      return ARMOR_PROFS;
    case "prof.weapon":
      return WEAPONS;
    case "prof.tool":
      return TOOLS;
    case "prof.language":
      return LANGUAGES;
    default:
      return [];
  }
}
