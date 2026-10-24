import { describe, expect, it } from "vitest";
import { deriveSpellMechanics, formatSpellList, parseSpellList, spellMatcher, spellNamesFromText, spellMechanics, splitSpellTitle } from "../spells";

describe("spell names from notes", () => {
  it("skips headings and keeps one name per line", () => {
    const text = ["Заговоры", "Луч холода [Ray of frost]", "• Огненный снаряд [Fire bolt]", "1 уровень", "1. Щит", "Щит", "Ячейки:", ""].join("\n");
    expect(spellNamesFromText(text)).toEqual(["Луч холода [Ray of frost]", "Огненный снаряд [Fire bolt]", "Щит"]);
  });

  it("splits Russian and English titles", () => {
    expect(splitSpellTitle("Огненный шар [Fireball]")).toEqual({ ru: "Огненный шар", en: "Fireball" });
    expect(splitSpellTitle("Щит")).toEqual({ ru: "Щит", en: "" });
  });
});

describe("spell lists with levels", () => {
  it("takes levels from headings and joins titles wrapped inside brackets", () => {
    const text = [
      "Заговоры",
      "Брызги кислоты [Acid Splash]",
      "3-й уровень (3 ячейки)",
      "Прикосновение вампира [Vampiric",
      "Touch]",
      "Круг 6",
      "Круг смерти [Circle of Death]",
      "Уровень",
      "- Перст смерти",
    ].join("\n");
    expect(parseSpellList(text)).toEqual([
      { name: "Брызги кислоты [Acid Splash]", level: 0 },
      { name: "Прикосновение вампира [Vampiric Touch]", level: 3 },
      { name: "Круг смерти [Circle of Death]", level: 6 },
      { name: "Перст смерти", level: 6 },
    ]);
  });

  it("keeps names without a heading unleveled and formats lists back", () => {
    const entries = parseSpellList("Щит\n1 уровень\nВолшебная стрела\nЗаговоры\nЛуч холода");
    expect(entries).toEqual([
      { name: "Щит", level: null },
      { name: "Волшебная стрела", level: 1 },
      { name: "Луч холода", level: 0 },
    ]);
    expect(formatSpellList(entries)).toBe("Щит\nЗаговоры\nЛуч холода\n1 уровень\nВолшебная стрела");
    expect(parseSpellList(formatSpellList(entries))).toEqual([entries[0], entries[2], entries[1]]);
  });
});

describe("spell matcher", () => {
  const row = (nameRu: string, nameEn: string, source = "dndsu", ownerId: string | null = null) => ({ nameRu, nameEn, source, ownerId });
  const rows = [
    row("Огненный шар", "Fireball"),
    row("Огненный шар", "Fireball", "next-dndsu"),
    row("Огненный шар", "Fireball", "custom", "u1"),
    row("Жуткий смех Таши", "Tasha's hideous laughter"),
    row("Щит веры", "Shield of faith"),
    row("Щит", "Shield"),
  ];

  it("prefers exact names, shared spells and the character's edition", () => {
    expect(spellMatcher(rows)("Fireball")).toBe(rows[0]);
    expect(spellMatcher(rows, "2024")("огненный ШАР")).toBe(rows[1]);
    expect(spellMatcher(rows)("Щит")).toBe(rows[5]);
  });

  it("falls back to whole-word partial names", () => {
    expect(spellMatcher(rows)("Жуткий смех [Hideous Laughter]")).toBe(rows[3]);
    expect(spellMatcher(rows)("Жуткий смех")).toBe(rows[3]);
    expect(spellMatcher(rows)("Смех")).toBeNull();
    expect(spellMatcher(rows)("Лазер [Laser]")).toBeNull();
  });
});

describe("spell mechanics from text", () => {
  it("finds saves, damage dice and types", () => {
    const fireball =
      "Яркий луч вспыхивает из вашего указательного пальца. Каждое существо в сфере с радиусом 20 футов должно совершить спасбросок Ловкости. Цель получает 8к6 урона огнём при провале или половину этого урона при успехе.\nНа больших уровнях. Если вы накладываете это заклинание, используя ячейку 4 уровня или выше, урон увеличивается на 1к6 за каждый уровень ячейки выше третьего.";
    expect(deriveSpellMechanics(fireball)).toEqual({ save: "dex", damage: "8d6", damageType: "Огонь" });
  });

  it("finds spell attacks, modifiers and types before the dice", () => {
    expect(deriveSpellMechanics("Совершите дальнобойную атаку заклинанием по цели. При попадании цель получает урон холодом 1к8.")).toEqual({
      attack: "ranged",
      damage: "1d8",
      damageType: "Холод",
    });
    expect(deriveSpellMechanics("Каждый дротик причиняет цели урон силовым полем 1к4 + 1.")).toMatchObject({ damage: "1d4 + 1", damageType: "Силовое поле" });
    expect(deriveSpellMechanics("Существо восстанавливает количество хитов, равное 1к8 + модификатор.")).toEqual({ damage: "1d8", damageType: "Лечение" });
    expect(deriveSpellMechanics("Вы становитесь невидимым.")).toEqual({});
  });

  it("keeps stored mechanics and fills missing ones from the description", () => {
    const doc = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Цель должна преуспеть в спасброске Мудрости." }] }] };
    expect(spellMechanics({ save: "cha" }, doc)).toEqual({ save: "cha" });
    expect(spellMechanics(null, doc)).toEqual({ save: "wis" });
    expect(spellMechanics(null)).toBeNull();
  });
});
