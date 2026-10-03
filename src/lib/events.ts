import { z } from "zod";

// Journal entries sent together with a character save.

export const CharacterEventInputSchema = z.object({
  kind: z.string().min(1).max(60),
  summary: z.string().min(1).max(2000),
  reason: z.string().max(1000).default(""),
  data: z.unknown().optional(),
  at: z.string().max(40).optional(),
});

export type CharacterEventInput = z.input<typeof CharacterEventInputSchema>;

export type CharacterEventRow = {
  id: string;
  kind: string;
  summary: string;
  reason: string;
  data: unknown;
  createdAt: string;
  userName: string | null;
};

export const EVENT_KIND_LABELS: Record<string, string> = {
  create: "Создание",
  import: "Импорт",
  hp: "Хиты",
  coins: "Монеты",
  xp: "Опыт",
  counter: "Счётчики",
  bonus: "Бонусы",
  override: "Ручные значения",
  item: "Предметы",
  feature: "Особенности",
  spell: "Заклинания",
  slot: "Ячейки",
  rest: "Отдых",
  inspiration: "Вдохновение",
  condition: "Состояния",
  concentration: "Концентрация",
  edit: "Изменения",
  level: "Уровень",
  settings: "Настройки",
};
