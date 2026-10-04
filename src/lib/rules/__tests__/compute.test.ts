import { describe, expect, it } from "vitest";
import { Calculator, computeSheet, formatStat } from "../compute";
import { newAttack, newCharacterDoc, newCounter, newEffect, newFeature, newItem } from "../defaults";
import { applyRest } from "../rest";
import type { CharacterDoc } from "../schema";

function wizard(): CharacterDoc {
  return newCharacterDoc({
    name: "Тест",
    classes: [{ id: "c1", name: "Волшебник", preset: "wizard", level: 13, hitDie: 6, caster: "full", spellAbility: "int" }],
    abilities: { str: { base: 8 }, dex: { base: 13 }, con: { base: 14 }, int: { base: 22 }, wis: { base: 12 }, cha: { base: 14 } },
    saves: { int: { prof: 1 }, wis: { prof: 1 } },
    skills: { arcana: { prof: 1 }, insight: { prof: 2 }, athletics: { prof: 1 } },
  });
}

describe("compute", () => {
  it("derives proficiency, modifiers, saves and skills", () => {
    const s = computeSheet(wizard());
    expect(s.level).toBe(13);
    expect(s.prof.value).toBe(5);
    expect(s.abilities.int.mod).toBe(6);
    expect(s.abilities.int.save.value).toBe(11);
    expect(s.abilities.str.save.value).toBe(-1);
    expect(s.skills.arcana.stat.value).toBe(11);
    expect(s.skills.insight.stat.value).toBe(11);
    expect(s.skills.athletics.stat.value).toBe(4);
    expect(s.passives.perception.value).toBe(11);
    expect(s.passives.insight.value).toBe(21);
    expect(s.initiative.value).toBe(1);
  });

  it("computes spellcasting from class tables", () => {
    const s = computeSheet(wizard());
    expect(s.spell.ability).toBe("int");
    expect(s.spell.dc.value).toBe(19);
    expect(s.spell.attack.value).toBe(11);
    expect(s.spell.slots.slice(1)).toEqual([4, 3, 3, 3, 2, 1, 1, 0, 0]);
  });

  it("applies labelled bonuses and records where they came from", () => {
    const doc = wizard();
    doc.abilities.int.base = 15;
    doc.bonuses.push(newEffect({ target: "ability.int.score", value: "+2", label: "за 4 уровень" }));
    doc.bonuses.push(newEffect({ target: "ability.int.score", value: "+1", label: "Отличная память" }));
    doc.bonuses.push(newEffect({ target: "spell.dc", value: "+2", label: "Мантия архимага" }));
    const s = computeSheet(doc);
    expect(s.abilities.int.score.value).toBe(18);
    expect(s.abilities.int.score.parts.map((p) => p.label)).toEqual(["Базовое значение", "за 4 уровень", "Отличная память"]);
    expect(s.spell.dc.value).toBe(8 + 5 + 4 + 2);
  });

  it("applies item effects only when equipped or attuned", () => {
    const doc = wizard();
    const ring = newItem({
      name: "Кольцо защиты",
      attunement: true,
      effects: [newEffect({ target: "ac", value: "1" }), newEffect({ target: "save.all", value: "1" })],
    });
    const cloak = newItem({ name: "Плащ", effects: [newEffect({ target: "ac", value: "1" })] });
    doc.items.push(ring, cloak);
    expect(computeSheet(doc).ac.value).toBe(11);
    ring.equipped = true;
    expect(computeSheet(doc).ac.value).toBe(11);
    ring.attuned = true;
    cloak.equipped = true;
    const s = computeSheet(doc);
    expect(s.ac.value).toBe(13);
    expect(s.abilities.int.save.value).toBe(12);
  });

  it("uses armor, shields and base formulas for AC", () => {
    const doc = wizard();
    doc.items.push(newItem({ name: "Кольчуга", category: "armor", equipped: true, armor: { type: "heavy", base: 16, dexCap: 0, stealthDisadvantage: true, strength: 13 } }));
    expect(computeSheet(doc).ac.value).toBe(16);
    doc.items[0].equipped = false;
    doc.features.push(
      newFeature({ name: "Доспехи мага", effects: [newEffect({ target: "ac.base", op: "set", value: "13 + DEX" })] }),
    );
    expect(computeSheet(doc).ac.value).toBe(14);
    doc.items.push(newItem({ name: "Щит", category: "shield", equipped: true }));
    expect(computeSheet(doc).ac.value).toBe(16);
    doc.settings.hidden.push("prof.shield");
    expect(computeSheet(doc).ac.value).toBe(14);
  });

  it("respects manual AC mode like Long Story Short", () => {
    const doc = wizard();
    doc.combat.acMode = "manual";
    doc.combat.acManual = 10;
    doc.bonuses.push(newEffect({ target: "ac", value: "1", label: "Ловкость" }));
    expect(computeSheet(doc).ac.value).toBe(11);
  });

  it("toggles mutation effects and attacks with the active flag", () => {
    const doc = wizard();
    const legs = newFeature({
      kind: "mutation",
      name: "Ноги кентавра",
      bodyPart: "legs",
      effects: [newEffect({ target: "speed.walk", value: "10" }), newEffect({ target: "resist", op: "grant", value: "fire" })],
      attacks: [newAttack({ name: "Удар копытом", ability: "str", damage: "1d6", damageType: "дробящий" })],
    });
    doc.features.push(legs);
    let s = computeSheet(doc);
    expect(s.speed.walk.value).toBe(40);
    expect(s.defenses.resist.map((r) => r.value)).toEqual(["fire"]);
    expect(s.attacks.find((a) => a.name === "Удар копытом")?.toHit?.value).toBe(4);
    expect(s.attacks.find((a) => a.name === "Удар копытом")?.damage).toBe("1d6−1");
    legs.active = false;
    s = computeSheet(doc);
    expect(s.speed.walk.value).toBe(30);
    expect(s.defenses.resist).toEqual([]);
    expect(s.attacks.find((a) => a.name === "Удар копытом")).toBeUndefined();
  });

  it("supports min/max/set operations and overrides with reasons", () => {
    const doc = wizard();
    doc.items.push(
      newItem({
        name: "Рукавицы силы огра",
        equipped: true,
        attunement: true,
        attuned: true,
        effects: [newEffect({ target: "ability.str.score", op: "min", value: "19" })],
      }),
    );
    let s = computeSheet(doc);
    expect(s.abilities.str.score.value).toBe(19);
    doc.overrides["ability.str.score"] = { value: 25, reason: "Зелье силы великана", at: "" };
    s = computeSheet(doc);
    expect(s.abilities.str.score.value).toBe(25);
    expect(s.abilities.str.score.overridden).toBe(true);
    expect(s.abilities.str.score.parts.at(-1)?.label).toBe("Зелье силы великана");
  });

  it("collects advantage, dice bonuses and passive adjustments", () => {
    const doc = wizard();
    doc.features.push(
      newFeature({
        name: "Благословение",
        effects: [
          newEffect({ target: "save.all", value: "1d4" }),
          newEffect({ target: "skill.perception", op: "adv", label: "чуткий нюх" }),
        ],
      }),
    );
    const s = computeSheet(doc);
    expect(formatStat(s.abilities.wis.save)).toBe("+6 +1d4");
    expect(s.skills.perception.stat.adv[0].text).toBe("чуткий нюх");
    expect(s.passives.perception.value).toBe(16);
  });

  it("evaluates expertise, half proficiency and proficiency grants from effects", () => {
    const doc = wizard();
    doc.features.push(
      newFeature({
        name: "Мастер на все руки",
        effects: [newEffect({ target: "skill.stealth.prof", op: "set", value: "0.5" })],
      }),
      newFeature({ name: "Экспертиза", effects: [newEffect({ target: "skill.arcana.prof", op: "set", value: "2" })] }),
    );
    const s = computeSheet(doc);
    expect(s.skills.stealth.prof).toBe(0.5);
    expect(s.skills.stealth.stat.value).toBe(1 + 2);
    expect(s.skills.arcana.stat.value).toBe(6 + 10);
  });

  it("computes HP automatically from hit dice and constitution", () => {
    const doc = wizard();
    // d6: 6 at level 1 + 12 * 4 = 54; CON +2 * 13 = 26
    expect(computeSheet(doc).hpMax.value).toBe(80);
    doc.features.push(newFeature({ name: "Крепкий", effects: [newEffect({ target: "hp.perLevel", value: "2" })] }));
    expect(computeSheet(doc).hpMax.value).toBe(106);
    doc.combat.hpMaxMode = "manual";
    doc.combat.hpMaxManual = 81;
    expect(computeSheet(doc).hpMax.value).toBe(81 + 26);
  });

  it("handles multiclass and pact slots", () => {
    const doc = newCharacterDoc({
      classes: [
        { id: "a", name: "Паладин", preset: "paladin", level: 6, hitDie: 10, caster: "half", spellAbility: "cha" },
        { id: "b", name: "Колдун", preset: "warlock", level: 3, hitDie: 8, caster: "pact", spellAbility: "cha" },
        { id: "c", name: "Чародей", preset: "sorcerer", level: 2, hitDie: 6, caster: "full", spellAbility: "cha" },
      ],
    });
    const s = computeSheet(doc);
    // caster level 3 + 2 = 5
    expect(s.spell.slots.slice(1, 4)).toEqual([4, 3, 2]);
    expect(s.spell.pact).toEqual({ count: 2, level: 2 });
  });

  it("evaluates counters and feature uses with formulas", () => {
    const doc = wizard();
    doc.counters.push(newCounter({ name: "Рубины", value: 4, max: "" }), newCounter({ name: "Ки", value: 1, max: "LVL", reset: "short" }));
    doc.features.push(newFeature({ name: "Тайное восстановление", uses: { max: "1", used: 1, reset: "long" } }));
    const s = computeSheet(doc);
    expect(s.counters[doc.counters[0].id]).toEqual({ value: null });
    expect(s.counters[doc.counters[1].id]).toEqual({ value: 13 });
    const c = new Calculator(doc);
    expect(c.evaluate("@counter.рубины * 2").ok && c.evaluate("@counter.рубины * 2")).toMatchObject({ value: { n: 8 } });
    const changes = applyRest(doc, "short");
    expect(doc.counters[1].value).toBe(13);
    expect(doc.features[0].uses?.used).toBe(1);
    expect(changes.length).toBeGreaterThan(0);
    applyRest(doc, "long");
    expect(doc.features[0].uses?.used).toBe(0);
  });

  it("applies conditions and exhaustion", () => {
    const doc = wizard();
    doc.combat.conditions = ["poisoned", "grappled"];
    doc.combat.exhaustion = 2;
    const s = computeSheet(doc);
    expect(s.skills.stealth.stat.dis.length).toBeGreaterThan(0);
    expect(s.speed.walk.value).toBe(0);
    doc.combat.conditions = [];
    expect(computeSheet(doc).speed.walk.value).toBe(15);
    doc.settings.edition = "2024";
    const s2 = computeSheet(doc);
    expect(s2.speed.walk.value).toBe(20);
    expect(s2.skills.arcana.stat.value).toBe(11 - 4);
  });

  it("reports formula errors instead of crashing and guards against cycles", () => {
    const doc = wizard();
    doc.bonuses.push(newEffect({ target: "ac", value: "2 +", label: "кривой" }));
    doc.bonuses.push(newEffect({ target: "ability.str.score", value: "@str.score", label: "цикл" }));
    const s = computeSheet(doc);
    expect(s.ac.errors[0]).toContain("кривой");
    expect(s.abilities.str.score.errors[0]).toContain("сама на себя");
  });

  it("restores resources on a long rest", () => {
    const doc = wizard();
    doc.combat.hpCurrent = 3;
    doc.combat.hpTemp = 5;
    doc.spellcasting.slotsUsed[3] = 2;
    doc.combat.hitDiceUsed["6"] = 10;
    doc.combat.exhaustion = 1;
    applyRest(doc, "long");
    expect(doc.combat.hpCurrent).toBe(80);
    expect(doc.combat.hpTemp).toBe(0);
    expect(doc.spellcasting.slotsUsed[3]).toBe(0);
    expect(doc.combat.hitDiceUsed["6"]).toBe(4);
    expect(doc.combat.exhaustion).toBe(0);
  });
});
