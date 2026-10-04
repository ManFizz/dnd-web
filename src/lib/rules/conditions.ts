import type { Effect } from "./schema";

// Standard conditions with short summaries in our own words and the mechanical
// effects the sheet can apply automatically.

export type ConditionDef = {
  id: string;
  label: string;
  summary: string;
  effects: Omit<Effect, "id" | "enabled" | "when">[];
};

const adv = (target: string, label = ""): ConditionDef["effects"][number] => ({ target, op: "adv", value: "", label });
const dis = (target: string, label = ""): ConditionDef["effects"][number] => ({ target, op: "dis", value: "", label });
const note = (target: string, label: string): ConditionDef["effects"][number] => ({ target, op: "note", value: label, label });
const speedZero = (): ConditionDef["effects"][number] => ({ target: "speed.walk", op: "max", value: "0", label: "" });

export const CONDITIONS: ConditionDef[] = [
  {
    id: "blinded",
    label: "Ослеплён",
    summary: "Ничего не видит, проваливает проверки на зрение. Атаки по нему с преимуществом, его атаки с помехой.",
    effects: [dis("attack.all")],
  },
  {
    id: "charmed",
    label: "Очарован",
    summary: "Не может атаковать очаровавшего. Тот получает преимущество на социальные проверки против него.",
    effects: [],
  },
  {
    id: "deafened",
    label: "Оглохший",
    summary: "Ничего не слышит, проваливает проверки на слух.",
    effects: [],
  },
  {
    id: "frightened",
    label: "Испуган",
    summary: "Помеха на проверки и атаки, пока видит источник страха. Не может добровольно приближаться к нему.",
    effects: [dis("check.all", "пока видит источник страха"), dis("attack.all", "пока видит источник страха")],
  },
  {
    id: "grappled",
    label: "Схвачен",
    summary: "Скорость равна 0 и не может увеличиваться.",
    effects: [speedZero()],
  },
  {
    id: "incapacitated",
    label: "Недееспособен",
    summary: "Не может совершать действия и реакции.",
    effects: [],
  },
  {
    id: "invisible",
    label: "Невидим",
    summary: "Невозможно увидеть без магии. Его атаки с преимуществом, атаки по нему с помехой.",
    effects: [adv("attack.all")],
  },
  {
    id: "paralyzed",
    label: "Парализован",
    summary: "Недееспособен, не двигается и не говорит. Проваливает спасброски Силы и Ловкости. Попадания вблизи критические.",
    effects: [note("save.str", "Автопровал"), note("save.dex", "Автопровал"), speedZero()],
  },
  {
    id: "petrified",
    label: "Окаменел",
    summary: "Превращён в камень. Сопротивление всем видам урона, проваливает спасброски Силы и Ловкости.",
    effects: [note("save.str", "Автопровал"), note("save.dex", "Автопровал"), speedZero()],
  },
  {
    id: "poisoned",
    label: "Отравлен",
    summary: "Помеха на броски атаки и проверки характеристик.",
    effects: [dis("attack.all"), dis("check.all")],
  },
  {
    id: "prone",
    label: "Сбит с ног",
    summary: "Передвигается ползком. Помеха на атаки. Атаки вблизи по нему с преимуществом, издали с помехой.",
    effects: [dis("attack.all")],
  },
  {
    id: "restrained",
    label: "Опутан",
    summary: "Скорость 0. Помеха на атаки и спасброски Ловкости. Атаки по нему с преимуществом.",
    effects: [speedZero(), dis("attack.all"), dis("save.dex")],
  },
  {
    id: "stunned",
    label: "Ошеломлён",
    summary: "Недееспособен, едва говорит. Проваливает спасброски Силы и Ловкости. Атаки по нему с преимуществом.",
    effects: [note("save.str", "Автопровал"), note("save.dex", "Автопровал")],
  },
  {
    id: "unconscious",
    label: "Без сознания",
    summary: "Недееспособен, роняет всё из рук и падает. Проваливает спасброски Силы и Ловкости.",
    effects: [note("save.str", "Автопровал"), note("save.dex", "Автопровал"), speedZero()],
  },
];

export function conditionDef(id: string): ConditionDef | undefined {
  return CONDITIONS.find((c) => c.id === id);
}

export function conditionLabel(id: string): string {
  return conditionDef(id)?.label ?? id;
}
