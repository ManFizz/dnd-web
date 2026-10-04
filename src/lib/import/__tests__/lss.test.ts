import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/rules/compute";
import { docToText } from "@/lib/rules/richtext";
import { convertLssDoc, importLss, mapLssTarget, splitLssClasses, splitSections } from "../lss";

const fixture = readFileSync(join(__dirname, "fixtures", "lss-wizard.json"), "utf8");

describe("LSS import", () => {
  const { doc, warnings, summary } = importLss(fixture);
  const sheet = computeSheet(doc);

  it("keeps the same numbers as the original sheet", () => {
    expect(doc.name).toBe("Тестовый волшебник");
    expect(sheet.level).toBe(13);
    expect(sheet.prof.value).toBe(5);
    const scores = Object.fromEntries(Object.entries(sheet.abilities).map(([k, v]) => [k, v.score.value]));
    expect(scores).toEqual({ str: 8, dex: 13, con: 14, int: 22, wis: 12, cha: 14 });
    const saves = Object.fromEntries(Object.entries(sheet.abilities).map(([k, v]) => [k, v.save.value]));
    expect(saves).toEqual({ str: -1, dex: 1, con: 2, int: 11, wis: 6, cha: 2 });
    const skills = Object.fromEntries(Object.entries(sheet.skills).map(([k, v]) => [k, v.stat.value]));
    expect(skills).toMatchObject({
      athletics: 4,
      acrobatics: 1,
      sleightOfHand: 1,
      stealth: 1,
      investigation: 11,
      history: 6,
      arcana: 11,
      nature: 6,
      religion: 6,
      perception: 1,
      survival: 1,
      medicine: 1,
      insight: 11,
      animalHandling: 1,
      performance: 2,
      intimidation: 2,
      deception: 2,
      persuasion: 2,
    });
    expect(sheet.passives.perception.value).toBe(11);
    expect(sheet.passives.insight.value).toBe(21);
    expect(sheet.passives.investigation.value).toBe(21);
    expect(sheet.ac.value).toBe(11);
    expect(sheet.initiative.value).toBe(1);
    expect(sheet.speed.walk.value).toBe(25);
    expect(sheet.hpMax.value).toBe(81);
    expect(doc.combat.hpCurrent).toBe(81);
    expect(sheet.spell.dc.value).toBe(21);
    expect(sheet.spell.attack.value).toBe(13);
    expect(sheet.spell.slots.slice(1)).toEqual([4, 3, 3, 3, 2, 1, 1, 0, 0]);
    expect(doc.spellcasting.slotsMode).toBe("auto");
    expect(doc.spellcasting.slotsUsed[4]).toBe(1);
    expect(doc.coins.gp).toBe(20000);
    expect(doc.info.xp).toBe(120000);
  });

  it("moves bonuses into matching items and feats", () => {
    const mantle = doc.items.find((i) => i.name === "Мантия архимага");
    expect(mantle?.effects.map((e) => e.target).sort()).toEqual(["spell.attack", "spell.dc"]);
    const book = doc.items.find((i) => i.name === "Некрономикон");
    expect(book?.effects.map((e) => `${e.target} ${e.value}`).sort()).toEqual(["ability.int.score +2", "ability.wis.score -1"]);
    expect(docToText(book!.description)).toContain("кап статов");
    const feat = doc.features.find((f) => f.name === "Мышиный путешественник");
    expect(feat?.kind).toBe("feat");
    expect(feat?.effects).toHaveLength(2);
    // Remaining bonuses stay as labelled character bonuses.
    expect(doc.bonuses.map((b) => b.label)).toContain("за 4 уровень");
    expect(doc.bonuses.map((b) => b.label)).not.toContain("Некрономикон");
    expect(summary.join("\n")).toContain("Мантия архимага");
  });

  it("explains every number with labelled parts", () => {
    const parts = sheet.abilities.int.score.parts.map((p) => p.label);
    expect(parts).toEqual(expect.arrayContaining(["Базовое значение", "за 4 уровень", "Городская мышь"]));
    expect(sheet.abilities.int.score.parts.some((p) => p.source === "Предмет: Некрономикон")).toBe(true);
  });

  it("converts rich text, formulas and sections", () => {
    const formulaNodes = JSON.stringify(doc.inventoryNotes);
    expect(formulaNodes).toContain('"type":"formula"');
    expect(formulaNodes).toContain('"expr":"1d4+2"');
    expect(formulaNodes).toContain("https://dnd.su/items/5-amulet-of-the-planes/");
    const lvlUp = doc.features.find((f) => f.name === "При lvlUP");
    expect(JSON.stringify(lvlUp?.description)).toContain('"expr":"DEX"');
    const sculpt = doc.features.find((f) => f.name === "Построение заклинаний");
    expect(sculpt?.kind).toBe("class");
    expect(sculpt?.level).toBe(2);
    expect(doc.notes.map((n) => n.title)).toEqual(expect.arrayContaining(["Сокровища", "Заметки 1"]));
    expect(docToText(doc.lore.appearance)).toBe("Мохнатый.");
  });

  it("parses proficiency text into chips", () => {
    expect(doc.proficiencies.languages.map((l) => l.name)).toEqual(["Бездны", "Инфернальный"]);
    expect(doc.proficiencies.tools.map((l) => l.name)).toEqual(["Набор травника"]);
    expect(doc.proficiencies.weapons.map((l) => l.name)).toContain("Кинжалы");
  });

  it("keeps spell references for later matching", () => {
    expect(doc.meta.unresolvedSpells.length).toBeGreaterThan(50);
    expect(doc.meta.unresolvedSpells.filter((s) => s.prepared)).toHaveLength(25);
    expect(warnings.filter((w) => w.startsWith("Формула"))).toEqual([]);
  });
});

describe("LSS helpers", () => {
  it("maps bonus targets", () => {
    expect(mapLssTarget("stat.int.score")).toBe("ability.int.score");
    expect(mapLssTarget("spellDC")).toBe("spell.dc");
    expect(mapLssTarget("spellAttack")).toBe("spell.attack");
    expect(mapLssTarget("ac")).toBe("ac");
    expect(mapLssTarget("skill.sleight of hand")).toBe("skill.sleightOfHand");
    expect(mapLssTarget("skills.investigation.passive")).toBe("passive.investigation");
    expect(mapLssTarget("something.weird")).toBeNull();
  });

  it("splits sections by dividers and caps titles", () => {
    const doc = convertLssDoc({
      value: {
        data: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "intro" }] },
            { type: "divider", content: [{ type: "text", text: "Первый" }] },
            { type: "paragraph", content: [{ type: "text", text: "a" }] },
            { type: "paragraph", content: [{ type: "text", text: "ВТОРОЙ РАЗДЕЛ" }] },
            { type: "paragraph", content: [{ type: "text", text: "b" }] },
          ],
        },
      },
    });
    expect(splitSections(doc).map((s) => s.title)).toEqual(["", "Первый", "Второй раздел"]);
  });

  it("splits multiclass text into classes", () => {
    expect(splitLssClasses("Воин 5 / Волшебник 3", "Мастер боевых искусств / Школа Иллюзий", 8)).toEqual([
      { name: "Воин", level: 5, subclass: "Мастер боевых искусств" },
      { name: "Волшебник", level: 3, subclass: "Школа Иллюзий" },
    ]);
    expect(splitLssClasses("Паладин (6), Колдун (2)", "Клятва мести", 8)).toEqual([
      { name: "Паладин", level: 6, subclass: "Клятва мести" },
      { name: "Колдун", level: 2, subclass: "" },
    ]);
    expect(splitLssClasses("Fighter 2 + Wizard 11 ур.", "", 13).map((c) => [c.name, c.level])).toEqual([
      ["Fighter", 2],
      ["Wizard", 11],
    ]);
    expect(splitLssClasses("Волшебник 13", "", 13)).toEqual([{ name: "Волшебник", level: 13, subclass: "" }]);
    expect(splitLssClasses("Волшебник", "Проклятокровый", 13)).toEqual([{ name: "Волшебник", level: 13, subclass: "Проклятокровый" }]);
    // Without levels the split is ambiguous: keep the text for the player to fix.
    expect(splitLssClasses("Воин / Волшебник", "", 8)).toEqual([{ name: "Воин / Волшебник", level: 8, subclass: "" }]);
    expect(splitLssClasses("Воин 15 / Волшебник 9", "", 20)).toHaveLength(1);
  });

  it("imports multiclass characters with their own hit dice and casting class", () => {
    const outer = JSON.parse(fixture) as { data: string };
    const data = JSON.parse(outer.data) as { info: { charClass: { value: string } } };
    data.info.charClass.value = "Воин 2 / Волшебник 11";
    const { doc, summary } = importLss(JSON.stringify({ ...outer, data: JSON.stringify(data) }));
    expect(doc.classes.map((c) => [c.name, c.level, c.hitDie, c.preset])).toEqual([
      ["Воин", 2, 10, "fighter"],
      ["Волшебник", 11, 6, "wizard"],
    ]);
    expect(doc.classes[0].spellAbility).toBe("");
    expect(doc.classes[1].spellAbility).toBe("int");
    expect(summary).toContain("Мультикласс: Воин 2 / Волшебник 11");
    const sheet = computeSheet(doc);
    expect(sheet.level).toBe(13);
    expect(sheet.spell.byClass.map((c) => c.name)).toEqual(["Волшебник"]);
  });

  it("rejects files that are not character exports", () => {
    expect(() => importLss("{}")).toThrow();
    expect(() => importLss("not json")).toThrow();
  });
});
