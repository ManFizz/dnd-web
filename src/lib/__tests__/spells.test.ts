import { describe, expect, it } from "vitest";
import { formatSpellList, parseSpellList, spellMatcher, spellNamesFromText, splitSpellTitle } from "../spells";

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
