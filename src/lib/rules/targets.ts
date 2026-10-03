import {
  ABILITIES,
  ABILITY_LABELS,
  DAMAGE_TYPES,
  SENSE_LABELS,
  SENSE_TYPES,
  SKILLS,
  SKILL_IDS,
  SPEED_LABELS,
  SPEED_TYPES,
} from "./constants";
import type { EffectOp } from "./schema";

// Catalog of effect targets for the editor UI and for validation.

export type TargetKind = "number" | "grant" | "prof";

export type TargetDef = {
  key: string;
  label: string;
  group: string;
  kind: TargetKind;
  /** Hint for the value field. */
  hint?: string;
};

const T = (key: string, label: string, group: string, kind: TargetKind = "number", hint?: string): TargetDef => ({
  key,
  label,
  group,
  kind,
  hint,
});

export const TARGETS: TargetDef[] = [
  ...ABILITIES.map((a) => T(`ability.${a}.score`, `${ABILITY_LABELS[a].full}: значение`, "Характеристики")),
  ...ABILITIES.map((a) => T(`ability.${a}.check`, `${ABILITY_LABELS[a].full}: проверки`, "Проверки")),
  T("check.all", "Все проверки характеристик", "Проверки"),
  ...ABILITIES.map((a) => T(`save.${a}`, `Спасбросок ${ABILITY_LABELS[a].full}`, "Спасброски")),
  T("save.all", "Все спасброски", "Спасброски"),
  ...ABILITIES.map((a) => T(`save.${a}.prof`, `Владение: спасбросок ${ABILITY_LABELS[a].full}`, "Спасброски", "prof")),
  ...SKILL_IDS.map((s) => T(`skill.${s}`, `${SKILLS[s].label}`, "Навыки")),
  T("skill.all", "Все навыки", "Навыки"),
  ...SKILL_IDS.map((s) => T(`skill.${s}.prof`, `Владение: ${SKILLS[s].label}`, "Навыки", "prof")),
  ...SKILL_IDS.map((s) => T(`passive.${s}`, `Пассивн. ${SKILLS[s].label}`, "Пассивные чувства")),
  T("ac", "Класс доспеха", "Защита"),
  T("ac.base", "Базовый КД (формула, берётся лучшая)", "Защита", "number", "например 13 + DEX"),
  T("initiative", "Инициатива", "Бой"),
  T("prof", "Бонус мастерства", "Бой"),
  T("hp.max", "Максимум хитов", "Хиты"),
  T("hp.perLevel", "Хиты за каждый уровень", "Хиты"),
  ...SPEED_TYPES.map((s) => T(`speed.${s}`, `Скорость: ${SPEED_LABELS[s].toLowerCase()}`, "Скорость")),
  T("attack.all", "Броски атаки (все)", "Атаки"),
  T("attack.melee", "Броски атаки ближнего боя", "Атаки"),
  T("attack.ranged", "Броски атаки дальнего боя", "Атаки"),
  T("attack.spell", "Атаки заклинаниями", "Атаки"),
  T("damage.all", "Урон (все атаки)", "Атаки"),
  T("damage.melee", "Урон ближнего боя", "Атаки"),
  T("damage.ranged", "Урон дальнего боя", "Атаки"),
  T("damage.spell", "Урон заклинаний", "Атаки"),
  T("spell.dc", "Сложность спасброска заклинаний", "Заклинания"),
  T("spell.attack", "Бонус атаки заклинаниями", "Заклинания"),
  ...Array.from({ length: 9 }, (_, i) => T(`spell.slots.${i + 1}`, `Ячейки ${i + 1} уровня`, "Заклинания")),
  ...SENSE_TYPES.map((s) => T(`sense.${s}`, `${SENSE_LABELS[s]} (футы)`, "Чувства")),
  T("inspiration.max", "Максимум вдохновения", "Прочее"),
  T("resist", "Сопротивление урону", "Сопротивления", "grant", "тип урона"),
  T("immune", "Иммунитет к урону", "Сопротивления", "grant", "тип урона"),
  T("vulnerable", "Уязвимость к урону", "Сопротивления", "grant", "тип урона"),
  T("condimmune", "Иммунитет к состоянию", "Сопротивления", "grant", "состояние"),
  T("prof.armor", "Владение доспехами", "Владения", "grant", "например Щиты"),
  T("prof.weapon", "Владение оружием", "Владения", "grant", "например Длинный меч"),
  T("prof.tool", "Владение инструментами", "Владения", "grant", "например Набор травника"),
  T("prof.language", "Язык", "Владения", "grant", "например Эльфийский"),
  T("feature", "Особенность (текстом)", "Прочее", "grant", "что умеет"),
];

const TARGET_MAP = new Map(TARGETS.map((t) => [t.key, t]));

export function targetDef(key: string): TargetDef | undefined {
  return TARGET_MAP.get(key);
}

export function targetLabel(key: string): string {
  return TARGET_MAP.get(key)?.label ?? key;
}

export const OP_LABELS: Record<EffectOp, string> = {
  add: "Прибавить",
  set: "Заменить базу",
  min: "Не меньше",
  max: "Не больше",
  adv: "Преимущество",
  dis: "Помеха",
  grant: "Даёт",
  note: "Заметка",
};

export function opsForTarget(key: string): EffectOp[] {
  const def = targetDef(key);
  if (!def) return ["add", "set", "min", "max", "adv", "dis", "note", "grant"];
  if (def.kind === "grant") return ["grant"];
  if (def.kind === "prof") return ["set"];
  if (key === "ac.base") return ["set"];
  const rollable = /^(ability\.\w+\.check|check\.all|save\.|skill\.|attack\.|initiative)/.test(key);
  return rollable ? ["add", "set", "min", "max", "adv", "dis", "note"] : ["add", "set", "min", "max", "note"];
}

export const DAMAGE_TYPE_OPTIONS = DAMAGE_TYPES.map((d) => ({ value: d.id, label: d.label }));

/** Short human readable description of an effect, e.g. "ИНТ +2", "Сопротивление: Огонь". */
export function describeEffectTarget(key: string): string {
  const ability = /^ability\.(\w+)\.score$/.exec(key);
  if (ability && ability[1] in ABILITY_LABELS) return ABILITY_LABELS[ability[1] as keyof typeof ABILITY_LABELS].short;
  return targetLabel(key);
}
