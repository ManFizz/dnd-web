import {
  ABILITIES,
  ABILITY_LABELS,
  SENSE_TYPES,
  SKILLS,
  SKILL_IDS,
  SPEED_TYPES,
  abilityMod,
  proficiencyForLevel,
  type Ability,
  type SenseType,
  type SkillId,
  type SpeedType,
} from "./constants";
import { CONDITIONS } from "./conditions";
import { evalFormula, formatValue, hasDice, type DiceTerm, type FValue } from "./formula";
import type { Attack, CharacterDoc, ClassEntry, Effect, Feature, Item, ProfLevel } from "./schema";
import { cantripTier, computePact, computeSlots, findClassPreset } from "./tables";

export type SourceType = "base" | "bonus" | "item" | "feature" | "condition" | "builtin" | "override";

export type Part = {
  /** What this contribution is ("за 4 уровень", "Базовое значение"). */
  label: string;
  /** Where it comes from ("Бонус", "Предмет: Мантия архимага"). */
  source: string;
  value: number;
  dice?: string;
  kind: "base" | "add" | "set" | "min" | "max" | "override" | "prof" | "info";
  ref?: { type: SourceType; id?: string; effectId?: string };
};

export type Note = { text: string; source: string };

export type Stat = {
  key: string;
  value: number;
  base: number;
  parts: Part[];
  dice: DiceTerm[];
  adv: Note[];
  dis: Note[];
  notes: Note[];
  overridden: boolean;
  errors: string[];
};

export type ActiveEffect = Effect & {
  sourceType: SourceType;
  sourceId: string;
  sourceName: string;
};

export type Grant = { value: string; source: string; sourceType: SourceType };

export type AttackRow = {
  id: string;
  name: string;
  source: string;
  kind: Attack["kind"];
  toHit: Stat | null;
  damage: string;
  damageValue: FValue | null;
  damageType: string;
  saveDc: number | null;
  saveAbility: Ability | "";
  range: string;
  notes: string;
  activation: Attack["activation"];
  error?: string;
};

const FEATURE_KIND_LABELS: Record<Feature["kind"], string> = {
  race: "Раса",
  class: "Класс",
  background: "Предыстория",
  feat: "Черта",
  mutation: "Мутация",
  boon: "Дар",
  curse: "Проклятие",
  other: "Особенность",
};

/** Source name for effects of GM grants whose details are hidden from the player. */
export const UNKNOWN_SOURCE = "Неизвестный источник";

export function featureKindLabel(kind: Feature["kind"]): string {
  return FEATURE_KIND_LABELS[kind];
}

/** Whether an item effect is currently active. */
export function itemEffectActive(item: Item, when: Effect["when"]): boolean {
  switch (when) {
    case "always":
      return true;
    case "equipped":
      return item.equipped;
    case "attuned":
      return item.attuned;
    default:
      return item.attunement ? item.attuned : item.equipped;
  }
}

class CycleError extends Error {}

const ABILITY_ALIASES: Record<string, Ability> = {};
for (const a of ABILITIES) {
  ABILITY_ALIASES[a] = a;
  ABILITY_ALIASES[ABILITY_LABELS[a].short.toLowerCase()] = a;
  ABILITY_ALIASES[ABILITY_LABELS[a].full.toLowerCase()] = a;
}
Object.assign(ABILITY_ALIASES, {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
  муд: "wis",
  сила: "str",
});

const SKILL_ALIASES: Record<string, SkillId> = {};
for (const s of SKILL_IDS) {
  SKILL_ALIASES[s.toLowerCase()] = s;
  SKILL_ALIASES[SKILLS[s].label.toLowerCase().replace(/\s+/g, "_")] = s;
  SKILL_ALIASES[SKILLS[s].en.toLowerCase().replace(/\s+/g, "_")] = s;
}

export const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");

function emptyStat(key: string, base: number): Stat {
  return { key, value: base, base, parts: [], dice: [], adv: [], dis: [], notes: [], overridden: false, errors: [] };
}

export class Calculator {
  readonly doc: CharacterDoc;
  readonly effects: ActiveEffect[] = [];
  private byTarget = new Map<string, ActiveEffect[]>();
  private cache = new Map<string, Stat>();
  private computing = new Set<string>();
  readonly warnings: string[] = [];

  constructor(doc: CharacterDoc) {
    this.doc = doc;
    this.collectEffects();
  }

  // ---------------------------------------------------------------- effects

  private collectEffects() {
    const add = (e: Effect, sourceType: SourceType, sourceId: string, sourceName: string) => {
      if (!e.enabled) return;
      const active: ActiveEffect = { ...e, sourceType, sourceId, sourceName };
      this.effects.push(active);
      const list = this.byTarget.get(e.target) ?? [];
      list.push(active);
      this.byTarget.set(e.target, list);
    };
    for (const b of this.doc.bonuses) add(b, "bonus", b.id, "Бонус");
    for (const f of this.doc.features) {
      if (!f.active) continue;
      const name = f.grant && f.grant.visibility !== "visible" ? UNKNOWN_SOURCE : `${FEATURE_KIND_LABELS[f.kind]}: ${f.name || "без названия"}`;
      for (const e of f.effects) add(e, "feature", f.id, name);
    }
    for (const item of this.doc.items) {
      for (const e of item.effects) {
        if (!itemEffectActive(item, e.when)) continue;
        add(e, "item", item.id, item.grant && item.grant.visibility !== "visible" ? UNKNOWN_SOURCE : `Предмет: ${item.name || "без названия"}`);
      }
    }
    for (const id of this.doc.combat.conditions) {
      const def = CONDITIONS.find((c) => c.id === id);
      if (!def) continue;
      def.effects.forEach((e, idx) =>
        add({ ...e, id: `${id}-${idx}`, enabled: true, when: "always", label: e.label || def.label }, "condition", id, `Состояние: ${def.label}`),
      );
    }
    const ex = this.doc.combat.exhaustion;
    if (ex > 0) {
      const src = `Истощение ${ex}`;
      const mk = (target: string, op: Effect["op"], value = ""): Effect => ({
        id: `exhaustion-${target}-${op}`,
        target,
        op,
        value,
        label: src,
        enabled: true,
        when: "always",
      });
      if (this.doc.settings.edition === "2024") {
        const penalty = String(-2 * ex);
        add(mk("check.all", "add", penalty), "builtin", "exhaustion", src);
        add(mk("save.all", "add", penalty), "builtin", "exhaustion", src);
        add(mk("attack.all", "add", penalty), "builtin", "exhaustion", src);
        add(mk("speed.walk", "add", String(-5 * ex)), "builtin", "exhaustion", src);
      } else {
        add(mk("check.all", "dis"), "builtin", "exhaustion", src);
        if (ex >= 3) {
          add(mk("attack.all", "dis"), "builtin", "exhaustion", src);
          add(mk("save.all", "dis"), "builtin", "exhaustion", src);
        }
        if (ex >= 5) add(mk("speed.walk", "max", "0"), "builtin", "exhaustion", src);
      }
    }
  }

  effectsFor(...targets: string[]): ActiveEffect[] {
    const out: ActiveEffect[] = [];
    for (const t of targets) out.push(...(this.byTarget.get(t) ?? []));
    return out;
  }

  // ------------------------------------------------------------- variables

  /** Resolve a variable name used inside formulas. */
  resolveVar = (raw: string): number | undefined => {
    const name = raw.replace(/^@/, "").toLowerCase();
    const parts = name.split(".");
    const head = parts[0];

    if (head in ABILITY_ALIASES) {
      const a = ABILITY_ALIASES[head];
      const sub = parts[1] ?? "mod";
      if (sub === "mod" || sub === "мод") return this.abilityMod(a);
      if (sub === "score" || sub === "знач") return this.value(`ability.${a}.score`);
      if (sub === "save" || sub === "спас") return this.value(`save.${a}`);
      if (sub === "check") return this.value(`ability.${a}.check`);
      return undefined;
    }
    switch (head) {
      case "prof":
      case "pb":
      case "бм":
      case "мастерство":
        return this.value("prof");
      case "lvl":
      case "level":
      case "ур":
      case "уровень":
        if (parts[1]) return this.classLevel(parts.slice(1).join("."));
        return this.level();
      case "ac":
      case "кд":
      case "кб":
        return this.value("ac");
      case "init":
      case "initiative":
      case "инициатива":
        return this.value("initiative");
      case "hp":
      case "хиты":
        if (parts[1] === "max" || parts[1] === "макс") return this.value("hp.max");
        if (parts[1] === "temp") return this.doc.combat.hpTemp;
        return this.doc.combat.hpCurrent;
      case "speed":
      case "скорость":
        return this.value(`speed.${(parts[1] as SpeedType) ?? "walk"}`);
      case "dc":
      case "сл":
        return this.value("spell.dc");
      case "spell":
      case "закл":
        if (parts[1] === "dc" || parts[1] === "сл") return this.value("spell.dc");
        if (parts[1] === "attack" || parts[1] === "атака") return this.value("spell.attack");
        if (parts[1] === "mod" || parts[1] === "мод") return this.value("spell.mod");
        return undefined;
      case "cantrip":
      case "заговор":
        return cantripTier(this.level());
      case "xp":
      case "опыт":
        return this.doc.info.xp;
      case "inspiration":
      case "вдохновение":
        return this.doc.combat.inspiration;
      case "skill":
      case "навык": {
        const s = SKILL_ALIASES[parts.slice(1).join("_")];
        return s ? this.value(`skill.${s}`) : undefined;
      }
      case "passive":
      case "пассив": {
        const s = SKILL_ALIASES[parts.slice(1).join("_")];
        return s ? this.value(`passive.${s}`) : undefined;
      }
      case "save":
      case "спас": {
        const a = ABILITY_ALIASES[parts[1] ?? ""];
        return a ? this.value(`save.${a}`) : undefined;
      }
      case "counter":
      case "счётчик":
      case "счетчик": {
        const key = parts.slice(1).join(".");
        const c = this.doc.counters.find((x) => x.id === key || slug(x.name) === key);
        return c?.value;
      }
    }
    if (name in SKILL_ALIASES) return this.value(`skill.${SKILL_ALIASES[name]}`);
    const counter = this.doc.counters.find((x) => slug(x.name) === name);
    if (counter) return counter.value;
    return undefined;
  };

  /** Evaluate a formula in the context of this character. */
  evaluate(src: string): { ok: true; value: FValue } | { ok: false; error: string } {
    try {
      return evalFormula(src, this.resolveVar);
    } catch (e) {
      if (e instanceof CycleError) return { ok: false, error: "Формула ссылается сама на себя" };
      throw e;
    }
  }

  // ------------------------------------------------------------ basic stats

  level(): number {
    const total = this.doc.classes.reduce((acc, c) => acc + c.level, 0);
    return Math.max(1, total);
  }

  classLevel(nameOrId: string): number {
    const key = slug(nameOrId);
    const preset = findClassPreset(nameOrId.replace(/_/g, " "));
    return this.doc.classes
      .filter((c) => slug(c.name) === key || c.preset === key || (preset && c.preset === preset.id))
      .reduce((acc, c) => acc + c.level, 0);
  }

  abilityMod(a: Ability): number {
    return abilityMod(this.value(`ability.${a}.score`));
  }

  value(key: string): number {
    return this.get(key).value;
  }

  get(key: string): Stat {
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (this.computing.has(key)) throw new CycleError(key);
    this.computing.add(key);
    try {
      const stat = this.compute(key);
      this.cache.set(key, stat);
      return stat;
    } finally {
      this.computing.delete(key);
    }
  }

  private compute(key: string): Stat {
    const p = key.split(".");
    switch (p[0]) {
      case "prof":
        return this.numeric(key, proficiencyForLevel(this.level()), "По уровню персонажа", ["prof"]);
      case "ability": {
        const a = p[1] as Ability;
        // Group keys like "ability.all.score" or "save.all" only exist as effect targets.
        if (!ABILITIES.includes(a)) break;
        if (p[2] === "score")
          return this.numeric(key, this.doc.abilities[a]?.base ?? 10, "Базовое значение", [key, "ability.all.score"]);
        if (p[2] === "check") {
          const mod = this.abilityMod(a);
          return this.numeric(key, mod, `Модификатор ${ABILITY_LABELS[a].short}`, [key, "check.all"]);
        }
        break;
      }
      case "save":
        if (!ABILITIES.includes(p[1] as Ability)) break;
        return this.saveStat(p[1] as Ability);
      case "skill":
        if (!SKILL_IDS.includes(p[1] as SkillId)) break;
        return this.skillStat(p[1] as SkillId);
      case "passive":
        if (!SKILL_IDS.includes(p[1] as SkillId)) break;
        return this.passiveStat(p[1] as SkillId);
      case "initiative":
        return this.numeric(key, this.abilityMod("dex"), "Модификатор ЛОВ", ["initiative", "ability.dex.check", "check.all"]);
      case "ac":
        return this.acStat();
      case "speed":
        return this.speedStat(p[1] as SpeedType);
      case "hp":
        return this.hpMaxStat();
      case "spell":
        return this.spellStat(p.slice(1));
      case "sense":
        return this.numeric(key, 0, "Нет", [key]);
      case "inspiration":
        return this.numeric(key, 0, "Без ограничения", [key]);
    }
    const s = emptyStat(key, 0);
    s.errors.push(`Неизвестный показатель ${key}`);
    return s;
  }

  /**
   * Generic numeric stat: base value, then effects (set, add, min, max) from
   * the given targets, then a manual override if present.
   */
  numeric(key: string, base: number, baseLabel: string, targets: string[], extraParts: Part[] = []): Stat {
    const stat = emptyStat(key, base);
    stat.parts.push({ label: baseLabel, source: "Основа", value: base, kind: "base", ref: { type: "base" } });
    stat.parts.push(...extraParts);
    let value = base + extraParts.filter((x) => x.kind === "add" || x.kind === "prof").reduce((a, x) => a + x.value, 0);
    const effects = this.effectsFor(...targets);

    const sets: { v: number; e: ActiveEffect }[] = [];
    const mins: { v: number; e: ActiveEffect }[] = [];
    const maxs: { v: number; e: ActiveEffect }[] = [];
    for (const e of effects) {
      const label = e.label || e.sourceName;
      if (e.op === "adv") {
        stat.adv.push({ text: e.label || e.value || "", source: e.sourceName });
        continue;
      }
      if (e.op === "dis") {
        stat.dis.push({ text: e.label || e.value || "", source: e.sourceName });
        continue;
      }
      if (e.op === "note") {
        stat.notes.push({ text: e.value || e.label, source: e.sourceName });
        continue;
      }
      if (e.op === "grant") continue;
      const r = this.evaluate(e.value || "0");
      if (!r.ok) {
        stat.errors.push(`${label}: ${r.error}`);
        continue;
      }
      const ref = { type: e.sourceType, id: e.sourceId, effectId: e.id };
      if (e.op === "add") {
        value += r.value.n;
        if (hasDice(r.value)) stat.dice.push(...r.value.dice);
        stat.parts.push({
          label,
          source: e.sourceName,
          value: r.value.n,
          dice: hasDice(r.value) ? formatValue({ n: 0, dice: r.value.dice }, { signed: true }) : undefined,
          kind: "add",
          ref,
        });
      } else if (hasDice(r.value)) {
        stat.errors.push(`${label}: здесь нужна формула без костей`);
      } else if (e.op === "set") sets.push({ v: r.value.n, e });
      else if (e.op === "min") mins.push({ v: r.value.n, e });
      else if (e.op === "max") maxs.push({ v: r.value.n, e });
    }
    if (sets.length) {
      const best = sets.reduce((a, b) => (b.v > a.v ? b : a));
      value += best.v - base;
      stat.base = best.v;
      stat.parts.push({
        label: best.e.label || best.e.sourceName,
        source: best.e.sourceName,
        value: best.v,
        kind: "set",
        ref: { type: best.e.sourceType, id: best.e.sourceId, effectId: best.e.id },
      });
    }
    for (const m of mins) {
      if (value < m.v) {
        stat.parts.push({ label: m.e.label || m.e.sourceName, source: m.e.sourceName, value: m.v, kind: "min" });
        value = m.v;
      }
    }
    for (const m of maxs) {
      if (value > m.v) {
        stat.parts.push({ label: m.e.label || m.e.sourceName, source: m.e.sourceName, value: m.v, kind: "max" });
        value = m.v;
      }
    }
    stat.value = value;
    return this.applyOverride(stat);
  }

  private applyOverride(stat: Stat): Stat {
    const ov = this.doc.overrides[stat.key];
    if (ov) {
      stat.parts.push({ label: ov.reason, source: "Ручное значение", value: ov.value, kind: "override", ref: { type: "override" } });
      stat.value = ov.value;
      stat.overridden = true;
    }
    return stat;
  }

  /** Highest proficiency level from the document and from effects. */
  profLevel(base: ProfLevel, target: string): { level: ProfLevel; sources: string[] } {
    let level: number = base;
    const sources: string[] = [];
    for (const e of this.effectsFor(target)) {
      if (e.op !== "set") continue;
      const v = Number(e.value);
      if ([0.5, 1, 2].includes(v)) {
        if (v > level) level = v;
        sources.push(e.label || e.sourceName);
      }
    }
    return { level: level as ProfLevel, sources };
  }

  profBonus(level: ProfLevel): number {
    const prof = this.value("prof");
    return level === 0.5 ? Math.floor(prof / 2) : Math.floor(prof * level);
  }

  private saveStat(a: Ability): Stat {
    const docSave = this.doc.saves[a];
    const { level, sources } = this.profLevel(docSave?.prof ?? 0, `save.${a}.prof`);
    const extra: Part[] = [];
    if (level > 0) {
      extra.push({
        label: level === 2 ? "Экспертиза" : level === 0.5 ? "Половина мастерства" : "Владение",
        source: [docSave?.source, ...sources].filter(Boolean).join(", ") || "Владение",
        value: this.profBonus(level),
        kind: "prof",
      });
    }
    const stat = this.numeric(`save.${a}`, this.abilityMod(a), `Модификатор ${ABILITY_LABELS[a].short}`, [`save.${a}`, "save.all"], extra);
    return stat;
  }

  skillAbility(s: SkillId): Ability {
    const override = this.doc.skills[s]?.ability;
    return (override || SKILLS[s].ability) as Ability;
  }

  skillProf(s: SkillId): { level: ProfLevel; sources: string[] } {
    const docSkill = this.doc.skills[s];
    const res = this.profLevel(docSkill?.prof ?? 0, `skill.${s}.prof`);
    if (docSkill?.prof && docSkill.source) res.sources.unshift(docSkill.source);
    return res;
  }

  private skillStat(s: SkillId): Stat {
    if (!(s in SKILLS)) return emptyStat(`skill.${s}`, 0);
    const a = this.skillAbility(s);
    const { level, sources } = this.skillProf(s);
    const extra: Part[] = [];
    if (level > 0) {
      extra.push({
        label: level === 2 ? "Экспертиза" : level === 0.5 ? "Половина мастерства" : "Владение",
        source: sources.join(", ") || "Владение",
        value: this.profBonus(level),
        kind: "prof",
      });
    }
    return this.numeric(
      `skill.${s}`,
      this.abilityMod(a),
      `Модификатор ${ABILITY_LABELS[a].short}`,
      [`skill.${s}`, "skill.all", `ability.${a}.check`, "check.all"],
      extra,
    );
  }

  private passiveStat(s: SkillId): Stat {
    const skill = this.get(`skill.${s}`);
    const extra: Part[] = [];
    if (skill.adv.length && !skill.dis.length) extra.push({ label: "Преимущество", source: "Правила", value: 5, kind: "add" });
    if (skill.dis.length && !skill.adv.length) extra.push({ label: "Помеха", source: "Правила", value: -5, kind: "add" });
    return this.numeric(`passive.${s}`, 10 + skill.value, `10 + ${SKILLS[s].label}`, [`passive.${s}`, "passive.all"], extra);
  }

  equippedArmor(): Item | undefined {
    return this.doc.items.find((i) => i.equipped && i.armor && i.category === "armor");
  }

  private acStat(): Stat {
    const combat = this.doc.combat;
    const dex = this.abilityMod("dex");
    const extra: Part[] = [];
    let base: number;
    let baseLabel: string;
    if (combat.acMode === "manual") {
      base = combat.acManual;
      baseLabel = combat.acReason ? `Задано вручную: ${combat.acReason}` : "Задано вручную";
    } else {
      const candidates: { v: number; label: string }[] = [{ v: 10 + dex, label: "Без доспеха: 10 + ЛОВ" }];
      const armor = this.equippedArmor();
      if (armor?.armor) {
        const a = armor.armor;
        const cap = a.type === "heavy" ? 0 : a.dexCap;
        const dexPart = cap === null ? dex : Math.min(dex, cap);
        candidates.push({
          v: a.base + dexPart,
          label: `${armor.name}: ${a.base}${a.type === "heavy" ? "" : cap === null ? " + ЛОВ" : ` + ЛОВ (макс. ${cap})`}`,
        });
      }
      for (const e of this.effectsFor("ac.base")) {
        if (e.op !== "set") continue;
        const r = this.evaluate(e.value || "0");
        if (r.ok && !hasDice(r.value)) candidates.push({ v: r.value.n, label: `${e.label || e.sourceName}: ${e.value}` });
      }
      const best = candidates.reduce((a, b) => (b.v > a.v ? b : a));
      base = best.v;
      baseLabel = best.label;
    }
    const shields = this.doc.items.filter((i) => i.equipped && i.category === "shield");
    if (shields.length && !this.doc.settings.hidden.includes("prof.shield")) {
      const best = shields.reduce((a, b) => (b.shieldBonus > a.shieldBonus ? b : a));
      extra.push({ label: best.name || "Щит", source: "Щит", value: best.shieldBonus, kind: "add" });
    }
    return this.numeric("ac", base, baseLabel, ["ac"], extra);
  }

  private speedStat(type: SpeedType): Stat {
    const base = this.doc.combat.speed[type] ?? 0;
    const stat = this.numeric(`speed.${type}`, base, "Базовая скорость", [`speed.${type}`, "speed.all"]);
    if (this.doc.settings.edition !== "2024" && this.doc.combat.exhaustion >= 2 && !stat.overridden) {
      stat.value = Math.floor(stat.value / 2);
      stat.parts.push({ label: "Скорость уменьшена вдвое", source: `Истощение ${this.doc.combat.exhaustion}`, value: stat.value, kind: "max" });
    }
    stat.value = Math.max(0, stat.value);
    return stat;
  }

  private hpMaxStat(): Stat {
    const combat = this.doc.combat;
    const extra: Part[] = [];
    let base: number;
    let baseLabel: string;
    const level = this.level();
    if (combat.hpMaxMode === "manual") {
      base = combat.hpMaxManual;
      baseLabel = combat.hpMaxReason ? `Задано вручную: ${combat.hpMaxReason}` : "Задано вручную";
    } else {
      base = 0;
      const classes = this.doc.classes.length ? this.doc.classes : [];
      classes.forEach((c, idx) => {
        const avg = Math.floor(c.hitDie / 2) + 1;
        const levels = c.level;
        const first = idx === 0 ? c.hitDie : avg;
        base += first + Math.max(0, levels - 1) * avg;
      });
      baseLabel = "Кости хитов (1-й уровень максимум, дальше среднее)";
      const con = this.abilityMod("con");
      if (con !== 0) extra.push({ label: `Модификатор ТЕЛ × ${level}`, source: "Телосложение", value: con * level, kind: "add" });
    }
    for (const e of this.effectsFor("hp.perLevel")) {
      if (e.op !== "add") continue;
      const r = this.evaluate(e.value || "0");
      if (r.ok && !hasDice(r.value))
        extra.push({ label: `${e.label || e.sourceName} (×${level})`, source: e.sourceName, value: r.value.n * level, kind: "add" });
    }
    const stat = this.numeric("hp.max", base, baseLabel, ["hp.max"], extra);
    if (this.doc.settings.edition !== "2024" && combat.exhaustion >= 4 && !stat.overridden) {
      stat.value = Math.floor(stat.value / 2);
      stat.parts.push({ label: "Максимум хитов уменьшен вдвое", source: `Истощение ${combat.exhaustion}`, value: stat.value, kind: "max" });
    }
    stat.value = Math.max(1, stat.value);
    return stat;
  }

  spellAbility(): Ability {
    const setting = this.doc.spellcasting.ability;
    if (setting !== "auto") return setting;
    for (const c of this.doc.classes) {
      if (c.spellAbility) return c.spellAbility;
      const preset = findClassPreset(c.preset || c.name);
      if (preset?.spellAbility) return preset.spellAbility;
    }
    return "int";
  }

  /** Spellcasting ability of one class (multiclass casters have one per class). */
  classSpellAbility(c: ClassEntry): Ability {
    if (c.spellAbility) return c.spellAbility;
    const preset = findClassPreset(c.preset || c.name);
    return preset?.spellAbility || this.spellAbility();
  }

  /** Classes that cast spells, in sheet order. */
  spellClasses(): ClassEntry[] {
    return this.doc.classes.filter((c) => c.caster !== "none" || c.spellAbility);
  }

  private spellNumber(key: string, kind: string, a: Ability, targets: string[]): Stat {
    const mod = this.abilityMod(a);
    const prof = this.value("prof");
    switch (kind) {
      case "mod":
        return this.numeric(key, mod, `Модификатор ${ABILITY_LABELS[a].short}`, ["spell.mod", ...targets]);
      case "dc":
        return this.numeric(key, 8 + prof + mod, `8 + мастерство (${prof}) + ${ABILITY_LABELS[a].short} (${mod})`, ["spell.dc", ...targets]);
      case "attack":
        return this.numeric(key, prof + mod, `Мастерство (${prof}) + ${ABILITY_LABELS[a].short} (${mod})`, [
          "spell.attack",
          "attack.spell",
          "attack.all",
          ...targets,
        ]);
    }
    return emptyStat(key, 0);
  }

  private spellStat(p: string[]): Stat {
    switch (p[0]) {
      case "mod":
      case "dc":
      case "attack":
        return this.spellNumber(`spell.${p[0]}`, p[0], this.spellAbility(), []);
      case "class": {
        // spell.class.<classId>.dc|attack|mod
        const key = `spell.class.${p[1]}.${p[2]}`;
        const c = this.doc.classes.find((x) => x.id === p[1]);
        return this.spellNumber(key, p[2], c ? this.classSpellAbility(c) : this.spellAbility(), [key]);
      }
      case "slots": {
        const level = Number(p[1]);
        const sc = this.doc.spellcasting;
        const base = sc.slotsMode === "manual" ? (sc.manualSlots[level] ?? 0) : (computeSlots(this.doc.classes)[level] ?? 0);
        const label = sc.slotsMode === "manual" ? "Задано вручную" : "По таблице классов";
        return this.numeric(`spell.slots.${level}`, base, label, [`spell.slots.${level}`]);
      }
    }
    return emptyStat(`spell.${p.join(".")}`, 0);
  }

  // ------------------------------------------------------------- non-numeric

  grants(target: string): Grant[] {
    return this.effectsFor(target)
      .filter((e) => e.op === "grant" && e.value.trim())
      .map((e) => ({ value: e.value.trim(), source: e.label || e.sourceName, sourceType: e.sourceType }));
  }

  /** Evaluate a counter / uses maximum formula. Returns null when unlimited. */
  maxOf(formulaSrc: string): { value: number | null; error?: string } {
    if (!formulaSrc.trim()) return { value: null };
    const r = this.evaluate(formulaSrc);
    if (!r.ok) return { value: null, error: r.error };
    if (hasDice(r.value)) return { value: null, error: "Максимум не может содержать кости" };
    return { value: r.value.n };
  }

  attackRows(): AttackRow[] {
    const rows: AttackRow[] = [];
    for (const item of this.doc.items) {
      if (item.weapon && (item.equipped || item.category === "weapon")) {
        rows.push(this.weaponRow(item));
      }
      if (item.attacks.length && (item.equipped || (item.attunement && item.attuned))) {
        for (const a of item.attacks) rows.push(this.attackRow(a, `Предмет: ${item.name}`));
      }
    }
    for (const f of this.doc.features) {
      if (!f.active) continue;
      for (const a of f.attacks) rows.push(this.attackRow(a, `${FEATURE_KIND_LABELS[f.kind]}: ${f.name}`));
    }
    for (const a of this.doc.attacks) rows.push(this.attackRow(a, ""));
    return rows;
  }

  private abilityForAttack(ability: Attack["ability"]): { mod: number; label: string } {
    if (ability === "none") return { mod: 0, label: "" };
    if (ability === "finesse") {
      const str = this.abilityMod("str");
      const dex = this.abilityMod("dex");
      return str >= dex ? { mod: str, label: "СИЛ" } : { mod: dex, label: "ЛОВ" };
    }
    if (ability === "spell") {
      const a = this.spellAbility();
      return { mod: this.abilityMod(a), label: ABILITY_LABELS[a].short };
    }
    return { mod: this.abilityMod(ability), label: ABILITY_LABELS[ability].short };
  }

  private weaponRow(item: Item): AttackRow {
    const w = item.weapon!;
    const ranged = w.ability === "dex" || /дальн|ranged|боеприпас/i.test(w.properties.join(" ")) || Boolean(w.range);
    const kindTarget = ranged ? "ranged" : "melee";
    const attack: Attack = {
      id: `item-${item.id}`,
      name: item.name || "Оружие",
      kind: "attack",
      ability: w.ability,
      proficient: w.proficient,
      bonus: w.attackBonus,
      damage: w.damage + (w.damageBonus ? ` + (${w.damageBonus})` : ""),
      addMod: true,
      damageType: w.damageType,
      saveAbility: "",
      saveDc: "",
      range: w.range,
      activation: "action",
      notes: w.properties.join(", "),
    };
    const row = this.attackRow(attack, item.equipped ? "Снаряжено" : "В инвентаре", kindTarget, item);
    return row;
  }

  attackRow(a: Attack, source: string, kindTarget: "melee" | "ranged" | "spell" = "melee", item?: Item): AttackRow {
    const { mod, label } = this.abilityForAttack(a.ability);
    const isSpell = a.ability === "spell";
    const kind = isSpell ? "spell" : kindTarget;
    let error: string | undefined;
    let toHit: Stat | null = null;
    if (a.kind === "attack") {
      const extra: Part[] = [];
      if (a.proficient) extra.push({ label: "Мастерство", source: "Владение", value: this.value("prof"), kind: "prof" });
      if (a.bonus.trim()) {
        const r = this.evaluate(a.bonus);
        if (r.ok) extra.push({ label: "Бонус атаки", source: a.name, value: r.value.n, kind: "add" });
        else error = r.error;
      }
      const targets = ["attack.all", `attack.${kind}`];
      if (item) targets.push(`item.${item.id}.attack`);
      toHit = this.numeric(`attack.${a.id}`, mod, label ? `Модификатор ${label}` : "Без характеристики", targets, extra);
    }
    let damage = "";
    let damageValue: FValue | null = null;
    if (a.damage.trim()) {
      const src = a.addMod && label ? `${a.damage} + ${mod}` : a.damage;
      const r = this.evaluate(src);
      if (r.ok) {
        let v = r.value;
        for (const e of this.effectsFor("damage.all", `damage.${kind}`)) {
          if (e.op !== "add") continue;
          const er = this.evaluate(e.value || "0");
          if (er.ok) v = { n: v.n + er.value.n, dice: [...v.dice, ...er.value.dice] };
        }
        damageValue = v;
        damage = formatValue(v);
      } else error = r.error;
    }
    let saveDc: number | null = null;
    if (a.kind === "save") {
      if (a.saveDc.trim()) {
        const r = this.evaluate(a.saveDc);
        if (r.ok && !hasDice(r.value)) saveDc = r.value.n;
        else error = r.ok ? "Сложность не может содержать кости" : r.error;
      } else saveDc = this.value("spell.dc");
    }
    return {
      id: a.id,
      name: a.name,
      source,
      kind: a.kind,
      toHit,
      damage,
      damageValue,
      damageType: a.damageType,
      saveDc,
      saveAbility: a.saveAbility,
      range: a.range,
      notes: a.notes,
      activation: a.activation,
      error,
    };
  }

  /** All proficiency lists merged with grants from effects. */
  proficiencyList(kind: "armor" | "weapons" | "tools" | "languages" | "other"): Grant[] {
    const own = this.doc.proficiencies[kind].map((p) => ({ value: p.name, source: p.source || "", sourceType: "base" as const }));
    const target = { armor: "prof.armor", weapons: "prof.weapon", tools: "prof.tool", languages: "prof.language", other: "feature" }[kind];
    return [...own, ...this.grants(target)];
  }
}

export type Sheet = ReturnType<typeof computeSheet>;

/** Compute everything the sheet displays in one pass. */
export function computeSheet(doc: CharacterDoc) {
  const c = new Calculator(doc);
  const abilities = Object.fromEntries(
    ABILITIES.map((a) => {
      const score = c.get(`ability.${a}.score`);
      return [a, { score, mod: abilityMod(score.value), check: c.get(`ability.${a}.check`), save: c.get(`save.${a}`) }];
    }),
  ) as Record<Ability, { score: Stat; mod: number; check: Stat; save: Stat }>;
  const saveProf = Object.fromEntries(
    ABILITIES.map((a) => [a, c.profLevel(doc.saves[a]?.prof ?? 0, `save.${a}.prof`).level]),
  ) as Record<Ability, ProfLevel>;
  const skills = Object.fromEntries(
    SKILL_IDS.map((s) => [s, { stat: c.get(`skill.${s}`), prof: c.skillProf(s).level, ability: c.skillAbility(s) }]),
  ) as Record<SkillId, { stat: Stat; prof: ProfLevel; ability: Ability }>;
  const passives = Object.fromEntries(SKILL_IDS.map((s) => [s, c.get(`passive.${s}`)])) as Record<SkillId, Stat>;
  const speed = Object.fromEntries(SPEED_TYPES.map((s) => [s, c.get(`speed.${s}`)])) as Record<SpeedType, Stat>;
  const senses = Object.fromEntries(SENSE_TYPES.map((s) => [s, c.get(`sense.${s}`)])) as Record<SenseType, Stat>;
  const slots = Array.from({ length: 10 }, (_, lvl) => (lvl === 0 ? 0 : c.value(`spell.slots.${lvl}`)));
  const pact = computePact(doc.classes);
  const counters = Object.fromEntries(doc.counters.map((x) => [x.id, c.maxOf(x.max)]));
  const featureUses = Object.fromEntries(doc.features.filter((f) => f.uses).map((f) => [f.id, c.maxOf(f.uses!.max)]));
  const itemCharges = Object.fromEntries(doc.items.filter((i) => i.charges).map((i) => [i.id, c.maxOf(i.charges!.max)]));
  const inspirationMax = c.value("inspiration.max");

  return {
    calc: c,
    level: c.level(),
    prof: c.get("prof"),
    abilities,
    saveProf,
    skills,
    passives,
    initiative: c.get("initiative"),
    ac: c.get("ac"),
    hpMax: c.get("hp.max"),
    speed,
    senses,
    spell: {
      ability: c.spellAbility(),
      mod: c.get("spell.mod"),
      dc: c.get("spell.dc"),
      attack: c.get("spell.attack"),
      slots,
      pact,
      hasCasting: slots.some((x) => x > 0) || pact.count > 0 || doc.spellcasting.spells.length > 0,
      /** Per-class DC and attack for multiclass casters. */
      byClass: c.spellClasses().map((cls) => ({
        id: cls.id,
        name: cls.name || "Класс",
        ability: c.classSpellAbility(cls),
        dc: c.get(`spell.class.${cls.id}.dc`),
        attack: c.get(`spell.class.${cls.id}.attack`),
      })),
    },
    defenses: {
      resist: c.grants("resist"),
      immune: c.grants("immune"),
      vulnerable: c.grants("vulnerable"),
      condimmune: c.grants("condimmune"),
    },
    proficiencies: {
      armor: c.proficiencyList("armor"),
      weapons: c.proficiencyList("weapons"),
      tools: c.proficiencyList("tools"),
      languages: c.proficiencyList("languages"),
      other: c.proficiencyList("other"),
    },
    attacks: c.attackRows(),
    counters,
    featureUses,
    itemCharges,
    inspirationMax: inspirationMax > 0 ? inspirationMax : null,
    hitDice: hitDiceSummary(doc),
  };
}

export function hitDiceSummary(doc: CharacterDoc): { die: number; total: number; used: number }[] {
  const byDie = new Map<number, number>();
  for (const c of doc.classes) byDie.set(c.hitDie, (byDie.get(c.hitDie) ?? 0) + c.level);
  return [...byDie.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([die, total]) => ({ die, total, used: Math.min(total, doc.combat.hitDiceUsed[String(die)] ?? 0) }));
}

/** Format a stat as a signed modifier with extra dice: "+6", "+6 +1d4". */
export function formatStat(stat: Stat, signed = true): string {
  const main = formatValue({ n: stat.value, dice: [] }, { signed });
  if (!stat.dice.length) return main;
  return `${main} ${formatValue({ n: 0, dice: stat.dice }, { signed: true })}`;
}
