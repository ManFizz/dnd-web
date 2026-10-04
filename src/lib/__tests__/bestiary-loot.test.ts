import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { parseCr } from "../creatures";
import { classifyCreatureUrl, parseCreatureDocument, parseStatLines } from "../import/dndsu/bestiary";
import { rollTable, splitCoins, STARTER_TABLES } from "../loot";
import { formatDeadTime, mutationCount, reroll, rollMutation, type PoolCreature } from "../mutations";

/** Deterministic generator: returns the given numbers in a loop. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("dnd.su bestiary parser", () => {
  it("reads a statblock written as text lines", () => {
    const s = parseStatLines([
      "Маленький гуманоид (гоблиноид), нейтрально-злой",
      "Класс Доспеха 15 (кожаный доспех, щит)",
      "Хиты 7 (2к6)",
      "Скорость 30 фт.",
      "СИЛ 8 (−1) ЛОВ 14 (+2) ТЕЛ 10 (+0) ИНТ 10 (+0) МДР 8 (−1) ХАР 8 (−1)",
      "Опасность 1/4 (50 опыта)",
    ]);
    expect(s).toMatchObject({ size: "small", type: "гуманоид", ac: 15, hp: 7, hpFormula: "2d6", cr: 0.25 });
    expect(s.abilities).toEqual({ str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
  });

  it("parses a card from a page", () => {
    const html = `<html><body><div class="card" data-id="bestiary:42">
      <h2 class="card-title"><span data-copy="Сатир [Satyr]">Сатир [Satyr]</span><span class="source-plaque" title="Monster Manual">MM</span></h2>
      <div itemprop="articleBody"><ul class="params">
        <li class="size-type-alignment">Средняя фея, хаотично-нейтральная</li>
        <li><strong>Класс Доспеха</strong> 14 (кожаный доспех)</li>
        <li><strong>Хиты</strong> 31 (7к8)</li>
        <li><strong>Скорость</strong> 40 фт.</li>
        <li><strong>Опасность</strong> 1/2 (100 опыта)</li>
      </ul></div></div></body></html>`;
    const { document } = parseHTML(html);
    const c = parseCreatureDocument(document as unknown as Document, "https://dnd.su/bestiary/42-satyr/");
    expect(c).toMatchObject({ nameRu: "Сатир", nameEn: "Satyr", size: "medium", type: "фея", cr: 0.5, hp: 31, ac: 14, externalId: "42" });
    expect(c.statblock.type).toBe("doc");
  });

  it("classifies bestiary urls and challenge ratings", () => {
    expect(classifyCreatureUrl("https://dnd.su/bestiary/10-goblin/")).toEqual({ source: "dndsu", id: "10" });
    expect(classifyCreatureUrl("https://dnd.su/homebrew/bestiary/7-x/")).toEqual({ source: "dndsu-homebrew", id: "7" });
    expect(classifyCreatureUrl("https://dnd.su/spells/10-x/")).toBeNull();
    expect(parseCr("1/8")).toBe(0.125);
    expect(parseCr("12")).toBe(12);
  });
});

describe("mutations after death", () => {
  it("counts the thresholds passed", () => {
    expect(mutationCount(0)).toBe(0);
    expect(mutationCount(1)).toBe(1);
    expect(mutationCount(2 * 1440)).toBe(5);
    expect(mutationCount(60 * 24 * 40)).toBe(7);
    expect(formatDeadTime(2 * 1440)).toBe("2 дня");
  });

  const pool: PoolCreature[] = [
    { id: "goblin", nameRu: "Гоблин", cr: 0.25, type: "гуманоид", size: "small" },
    { id: "ogre", nameRu: "Огр", cr: 2, type: "великан", size: "large" },
    { id: "troll", nameRu: "Тролль", cr: 5, type: "великан", size: "large" },
    { id: "lich", nameRu: "Лич", cr: 21, type: "нежить", size: "medium" },
  ];

  it("raises the danger until a creature fits", () => {
    // d20 = 3; the first of the sorted types and sizes (giant, large); d6 = 4 (legs).
    const m = rollMutation(pool, seq(0.1, 0.0, 0.0, 0.5, 0.0));
    expect(m.dangerRoll).toBe(3);
    expect(m.creatureId).toBe("troll");
    expect(m.danger).toBe(5);
    expect(m.part).toBe("legs");
    expect(m.name).toBe("Ноги: Тролль");
    expect(m.log).toContain("Опасность 3: нет подходящих существ");
  });

  it("never drops creatures below CR 1 and goes above 20 last", () => {
    const m = rollMutation(pool, seq(0.99), { type: "нежить", size: "medium", partRoll: 6 });
    expect(m.creatureId).toBe("lich");
    expect(m.part).toBe("choice");
    const none = rollMutation(pool, seq(0.5), { type: "гуманоид", size: "small" });
    expect(none.creatureId).toBeNull();
  });

  it("rerolls one filter and keeps the GM's notes", () => {
    const first = rollMutation(pool, seq(0.1, 0.0, 0.0, 0.5, 0.0));
    const again = reroll(pool, { ...first, text: "Регенерация" }, "part", seq(0.0));
    expect(again.creatureId).toBe("troll");
    expect(again.part).toBe("head");
    expect(again.text).toBe("Регенерация");
  });
});

describe("loot tables", () => {
  it("rolls coins, items and nested tables", () => {
    const gems = {
      name: "Камни",
      rolls: "1",
      rows: [
        {
          id: "a",
          weight: 1,
          kind: "item" as const,
          templateId: "t1",
          folder: "",
          tableId: "",
          quantity: "2",
          coin: "gp" as const,
          amount: "",
          curseChance: 0,
        },
      ],
    };
    const main = {
      name: "Сундук",
      rolls: "2",
      rows: [
        {
          id: "c",
          weight: 1,
          kind: "coins" as const,
          templateId: "",
          folder: "",
          tableId: "",
          quantity: "1",
          coin: "gp" as const,
          amount: "10",
          curseChance: 0,
        },
        {
          id: "t",
          weight: 1,
          kind: "table" as const,
          templateId: "",
          folder: "",
          tableId: "gems",
          quantity: "1",
          coin: "gp" as const,
          amount: "",
          curseChance: 0,
        },
      ],
    };
    const out = rollTable(main, { tables: new Map([["gems", gems]]), templates: [{ id: "t1", name: "Рубин", folder: "", kind: "item" }], rng: seq(0.1, 0.9) });
    expect(out.coins.gp).toBe(10);
    expect(out.items).toEqual([expect.objectContaining({ name: "Рубин", quantity: 2 })]);
  });

  it("starter tables roll multiplied coins", () => {
    const out = rollTable(STARTER_TABLES[1], { tables: new Map(), templates: [], rng: seq(0.99, 0.5) });
    expect(out.coins.pp).toBeGreaterThanOrEqual(20);
    expect(out.log.join(" ")).not.toMatch(/не считается/);
  });

  it("splits coins evenly and leaves the rest", () => {
    expect(splitCoins({ cp: 0, sp: 0, ep: 0, gp: 10, pp: 1 }, 3)).toEqual({
      each: { cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 },
      rest: { cp: 0, sp: 0, ep: 0, gp: 1, pp: 1 },
    });
  });
});
