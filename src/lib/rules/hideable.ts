import { COINS, COIN_LABELS, SKILLS, SKILL_IDS } from "./constants";
import type { CharacterDoc } from "./schema";

// Mechanics a player can switch off. Hidden things disappear from the sheet;
// their data stays in the document, so switching back restores them.

export type HideableGroup = { title: string; items: { key: string; label: string; hint?: string }[] };

export const HIDEABLE: HideableGroup[] = [
  {
    title: "Навыки",
    items: SKILL_IDS.map((s) => ({ key: `skill.${s}`, label: SKILLS[s].label })),
  },
  {
    title: "Бой",
    items: [
      { key: "prof.shield", label: "Щит", hint: "Переключатель щита у КД и бонус щита" },
      { key: "combat.inspiration", label: "Вдохновение" },
      { key: "combat.exhaustion", label: "Истощение" },
      { key: "combat.deathSaves", label: "Спасброски от смерти" },
      { key: "combat.hitDice", label: "Кости хитов" },
      { key: "combat.conditions", label: "Состояния" },
      { key: "combat.passives", label: "Пассивные чувства" },
    ],
  },
  {
    title: "Вкладки",
    items: [
      { key: "tab.spells", label: "Заклинания" },
      { key: "tab.mutations", label: "Мутации" },
      { key: "tab.counters", label: "Счётчики" },
      { key: "tab.notes", label: "Заметки" },
    ],
  },
  {
    title: "Монеты и вес",
    items: [
      ...COINS.map((c) => ({ key: `coin.${c}`, label: `${COIN_LABELS[c].full} монеты` })),
      { key: "item.weight", label: "Вес и грузоподъёмность" },
    ],
  },
  {
    title: "Прочее",
    items: [{ key: "info.xp", label: "Опыт", hint: "Если играете по вехам" }],
  },
];

export function isHidden(doc: Pick<CharacterDoc, "settings">, key: string): boolean {
  return doc.settings.hidden.includes(key);
}
