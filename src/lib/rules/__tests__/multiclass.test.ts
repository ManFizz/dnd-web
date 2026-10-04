import { describe, expect, it } from "vitest";
import { computeSheet } from "../compute";
import { newCharacterDoc, newEffect } from "../defaults";
import { gainInspiration, inspirationEntries, spendInspiration } from "../inspiration";
import { addMulticlass, applyLevelUp, levelUpSummary, makeStartingClass, multiclassRule, prerequisiteIssues, spellClassId } from "../multiclass";
import type { CharacterDoc } from "../schema";
import { CLASS_PRESETS, computeSlots } from "../tables";

const preset = (id: string) => CLASS_PRESETS.find((p) => p.id === id)!;

function wizard(level = 10): CharacterDoc {
  return newCharacterDoc({
    name: "Тест",
    classes: [{ id: "w", name: "Волшебник", preset: "wizard", level, hitDie: 6, caster: "full", spellAbility: "int" }],
    abilities: { str: { base: 8 }, dex: { base: 13 }, con: { base: 14 }, int: { base: 22 }, wis: { base: 12 }, cha: { base: 14 } },
    saves: { int: { prof: 1 }, wis: { prof: 1 } },
  });
}

describe("multiclass rules", () => {
  it("checks ability prerequisites for every class", () => {
    const scores = { str: 8, dex: 13, con: 14, int: 22, wis: 12, cha: 14 };
    // A fighter needs Strength 13 or Dexterity 13.
    expect(prerequisiteIssues(scores, ["wizard", "fighter"], "2014")).toEqual([]);
    expect(prerequisiteIssues(scores, ["wizard", "paladin"], "2014")).toEqual(["Паладин: нужно Сила 13 и Харизма 13"]);
    expect(prerequisiteIssues({ ...scores, int: 12 }, ["wizard", "cleric"], "2014")).toEqual([
      "Волшебник: нужно Интеллект 13",
      "Жрец: нужно Мудрость 13",
    ]);
  });

  it("grants only the reduced proficiencies and no saving throws", () => {
    const doc = wizard();
    const rule = multiclassRule("fighter", "2014")!;
    const entry = addMulticlass(doc, {
      preset: preset("fighter"),
      level: 1,
      armor: rule.armor,
      weapons: rule.weapons,
      tools: [],
      skills: [],
    });
    expect(doc.classes.map((c) => c.id)).toEqual(["w", entry.id]);
    expect(entry).toMatchObject({ name: "Воин", level: 1, hitDie: 10, caster: "none" });
    expect(doc.saves.str.prof).toBe(0);
    expect(doc.saves.con.prof).toBe(0);
    expect(doc.proficiencies.armor.map((p) => p.name)).toEqual(["Лёгкие доспехи", "Средние доспехи", "Щиты"]);
    expect(doc.proficiencies.weapons.every((p) => p.source === "Мультикласс: Воин")).toBe(true);
    // 2024 fighters only add martial weapons on top of simple ones.
    expect(multiclassRule("fighter", "2024")!.weapons).toEqual(["Воинское оружие"]);
  });

  it("adds the chosen skill and keeps existing proficiencies", () => {
    const doc = wizard();
    doc.skills.stealth.prof = 2;
    addMulticlass(doc, { preset: preset("rogue"), level: 1, armor: [], weapons: [], tools: ["Воровские инструменты"], skills: ["stealth", "acrobatics"] });
    expect(doc.skills.stealth.prof).toBe(2);
    expect(doc.skills.acrobatics).toMatchObject({ prof: 1, source: "Мультикласс: Плут" });
    expect(doc.proficiencies.tools.map((t) => t.name)).toEqual(["Воровские инструменты"]);
  });

  it("previews a level: slots, proficiency, cantrips and ability increases", () => {
    const doc = wizard(4);
    const s = levelUpSummary(doc, "w")!;
    expect(s.level).toEqual([4, 5]);
    expect(s.prof).toEqual([2, 3]);
    expect(s.hitDie).toBe(6);
    expect(s.slots).toEqual([{ level: 3, before: 0, after: 2 }]);
    expect(s.cantripsGrow).toBe(true);
    expect(s.asi).toBe(false);
    expect(levelUpSummary(wizard(3), "w")!.asi).toBe(true);
    expect(levelUpSummary(wizard(20), "w")).toBeNull();
  });

  it("combines caster levels for spell slots", () => {
    // Wizard 5 + cleric 3 casts like an 8th-level caster.
    expect(computeSlots([{ caster: "full", level: 5 }, { caster: "full", level: 3 }])).toEqual(computeSlots([{ caster: "full", level: 8 }]));
    // A paladin adds half its levels, rounded down, once multiclassed.
    expect(computeSlots([{ caster: "half", level: 5 }, { caster: "full", level: 1 }])).toEqual(computeSlots([{ caster: "full", level: 3 }]));
  });

  it("raises a level and keeps current HP in step with the maximum", () => {
    const doc = wizard(4);
    addMulticlass(doc, { preset: preset("fighter"), level: 1, armor: [], weapons: [], tools: [], skills: [] });
    const fighter = doc.classes[1];
    const before = computeSheet(doc).hpMax.value;
    doc.combat.hpCurrent = 20;
    const after = (() => {
      const copy = structuredClone(doc);
      applyLevelUp(copy, fighter.id, 0);
      return computeSheet(copy).hpMax.value;
    })();
    // d10 average is 6, plus Constitution +2.
    expect(after - before).toBe(8);
    applyLevelUp(doc, fighter.id, after - before);
    expect(doc.classes[1].level).toBe(2);
    expect(doc.combat.hpCurrent).toBe(28);
  });

  it("gives the starting class the full hit die at level 1", () => {
    const doc = wizard(1);
    addMulticlass(doc, { preset: preset("fighter"), level: 1, armor: [], weapons: [], tools: [], skills: [] });
    // Wizard first: 6 + 6 (fighter average) + 2 × 2 Constitution.
    expect(computeSheet(doc).hpMax.value).toBe(16);
    makeStartingClass(doc, doc.classes[1].id);
    expect(doc.classes[0].name).toBe("Воин");
    // Fighter first: 10 + 4 (wizard average) + 4.
    expect(computeSheet(doc).hpMax.value).toBe(18);
  });
});

describe("spells of several classes", () => {
  function wizardCleric(): CharacterDoc {
    const doc = wizard(10);
    addMulticlass(doc, { preset: preset("cleric"), level: 3, armor: [], weapons: [], tools: [], skills: [] });
    return doc;
  }

  it("computes DC and attack for every casting class", () => {
    const doc = wizardCleric();
    doc.bonuses.push(newEffect({ target: "spell.dc", op: "add", value: "1", label: "Посох" }));
    const s = computeSheet(doc);
    const [w, c] = s.spell.byClass;
    expect(s.spell.byClass.map((x) => x.name)).toEqual(["Волшебник", "Жрец"]);
    // Prof +5 at level 13; INT +6, WIS +1; the staff adds 1 to every DC.
    expect([w.dc.value, w.attack.value]).toEqual([20, 11]);
    expect([c.dc.value, c.attack.value]).toEqual([15, 6]);
    expect(c.ability).toBe("wis");
  });

  it("assigns spells to a class explicitly or by the spell's class list", () => {
    const doc = wizardCleric();
    const casters = doc.classes;
    const cleric = casters[1].id;
    expect(spellClassId({ classId: cleric }, casters, ["Волшебник"])).toBe(cleric);
    expect(spellClassId({ classId: "" }, casters, ["Бард", "Жрец"])).toBe(cleric);
    expect(spellClassId({ classId: "" }, casters, ["волшебник", "Чародей"])).toBe("w");
    // Both classes can cast it: the player decides.
    expect(spellClassId({ classId: "" }, casters, ["Волшебник", "Жрец"])).toBeNull();
    expect(spellClassId({ classId: "gone" }, casters, [])).toBeNull();
  });
});

describe("inspiration", () => {
  const combat = () => ({ inspiration: 0, inspirationNotes: [] as CharacterDoc["combat"]["inspirationNotes"] });

  it("remembers where each point came from and spends the oldest", () => {
    const c = combat();
    gainInspiration(c, "Спас деревню", "2026-10-01T10:00:00Z");
    gainInspiration(c, "Отыгрыш", "2026-10-02T10:00:00Z");
    expect(inspirationEntries(c).map((e) => e.reason)).toEqual(["Спас деревню", "Отыгрыш"]);
    expect(spendInspiration(c)?.reason).toBe("Спас деревню");
    expect(c.inspiration).toBe(1);
    expect(inspirationEntries(c).map((e) => e.reason)).toEqual(["Отыгрыш"]);
  });

  it("spends a chosen point and handles points without notes", () => {
    const c = { inspiration: 2, inspirationNotes: [] as CharacterDoc["combat"]["inspirationNotes"] };
    gainInspiration(c, "Решение мастера");
    const entries = inspirationEntries(c);
    expect(entries.map((e) => e.reason)).toEqual(["", "", "Решение мастера"]);
    spendInspiration(c, entries[2].id);
    expect(c.inspiration).toBe(2);
    expect(inspirationEntries(c).every((e) => e.id === null)).toBe(true);
    spendInspiration(c);
    spendInspiration(c);
    expect(spendInspiration(c)).toBeNull();
    expect(c.inspiration).toBe(0);
  });
});
