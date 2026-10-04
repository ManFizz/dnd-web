import { describe, expect, it } from "vitest";
import { boostBonuses, buildCharacter, pointBuyCost, pointBuyValid, rollAbilityScore, type CharacterChoices } from "../builder";
import { computeSheet } from "../compute";

const base = (over: Partial<CharacterChoices> = {}): CharacterChoices => ({
  name: "Мирра",
  edition: "2014",
  requireReasons: true,
  race: { presetId: "human", name: "" },
  cls: { presetId: "wizard", name: "", hitDie: 6, level: 1, subclass: "", skills: ["arcana", "investigation"] },
  background: { presetId: "sage", name: "" },
  scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
  boost: { mode: "none", abilities: [] },
  ...over,
});

describe("character builder", () => {
  it("applies race, class and background presets", () => {
    const doc = buildCharacter(base());
    const s = computeSheet(doc);
    expect(doc.info.race).toBe("Человек");
    expect(doc.info.background).toBe("Мудрец");
    expect(doc.classes).toHaveLength(1);
    // Human: +1 to every ability.
    expect(s.abilities.int.score.value).toBe(16);
    expect(s.abilities.con.score.value).toBe(14);
    // Wizard saves and chosen skills, sage skills.
    expect(s.saveProf.int).toBe(1);
    expect(s.saveProf.wis).toBe(1);
    expect(s.skills.arcana.prof).toBe(1);
    expect(s.skills.investigation.prof).toBe(1);
    expect(s.skills.history.prof).toBe(1);
    // d6 + CON +2 at level 1, current HP starts full.
    expect(s.hpMax.value).toBe(8);
    expect(doc.combat.hpCurrent).toBe(8);
    expect(doc.settings.requireReasons).toBe(true);
  });

  it("uses free increases instead of racial ones in 2024", () => {
    const doc = buildCharacter(base({ edition: "2024", boost: { mode: "2-1", abilities: ["int", "con"] } }));
    const s = computeSheet(doc);
    expect(s.abilities.int.score.value).toBe(17);
    expect(s.abilities.con.score.value).toBe(14);
    expect(s.abilities.str.score.value).toBe(8);
    expect(doc.features.find((f) => f.name === "Увеличение характеристик")?.source).toBe("Предыстория: Мудрец");
  });

  it("supports custom race, class and background", () => {
    const doc = buildCharacter(
      base({
        race: { presetId: null, name: "Кенку" },
        cls: { presetId: null, name: "Кровавый охотник", hitDie: 10, level: 5, subclass: "Орден ликана", skills: ["athletics"] },
        background: { presetId: null, name: "Беглец" },
      }),
    );
    const s = computeSheet(doc);
    expect(doc.info.race).toBe("Кенку");
    expect(doc.info.background).toBe("Беглец");
    expect(doc.classes[0]).toMatchObject({ name: "Кровавый охотник", hitDie: 10, level: 5, subclass: "Орден ликана" });
    expect(s.skills.athletics.prof).toBe(1);
    expect(s.level).toBe(5);
    expect(doc.info.xp).toBe(6500);
    // 10 + 4 × 6 + CON(+1) × 5
    expect(s.hpMax.value).toBe(39);
  });

  it("validates point buy and rolls 4d6 drop lowest", () => {
    expect(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(pointBuyValid({ str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 })).toBe(false);
    expect(pointBuyValid({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(false);
    const seq = [0, 0.99, 0.5, 0.2];
    let i = 0;
    expect(rollAbilityScore(() => seq[i++])).toBe(6 + 4 + 2);
    expect(boostBonuses({ mode: "1-1-1", abilities: ["str", "str", "dex"] })).toEqual({ str: 1, dex: 1 });
  });
});
