import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { docToText } from "@/lib/rules/richtext";
import { childSitemaps, classifySpellUrl, discoverSpellUrls, parseSpellDocument } from "../dndsu/parse";
import { fromSpellbookRecord } from "../dndsu/formats";

const page = `<!doctype html><html><body>
<div class="card" data-id="spells:42">
  <div class="card__header">
    <h2 class="card-title"><span data-copy="Тайный знак [Secret Mark]">Тайный знак</span><span class="source-plaque" title="Player's Handbook">PH14</span></h2>
  </div>
  <div class="card__body" itemprop="articleBody">
    <ul class="params">
      <li class="size-type-alignment">1 уровень, прорицание (ритуал)</li>
      <li><strong>Время накладывания:</strong> 1 действие</li>
      <li><strong>Дистанция:</strong> 60 футов</li>
      <li><strong>Компоненты:</strong> В, С, М (щепотка соли)</li>
      <li><strong>Длительность:</strong> Концентрация, вплоть до 1 минуты</li>
      <li><strong>Классы:</strong> <a href="/class/1-wizard/">волшебник</a>, друид TCE</li>
      <li><strong>Подклассы:</strong> клятвопреступник (паладин)</li>
      <li class="subsection desc"><div itemprop="description">
        <p>Вы касаетесь существа. Оно получает <strong>2к10</strong> урона огнём, а <a href="/spells/10-acid/">ссылка</a> ведёт дальше.</p>
        <ul><li>Первый эффект</li><li>Второй эффект</li></ul>
        <table><tr><th>к6</th><th>Эффект</th></tr><tr><td>1</td><td>Свет</td></tr></table>
        <p><strong><em>На больших уровнях.</em></strong> Урон увеличивается на 1к10.</p>
      </div></li>
    </ul>
  </div>
</div>
</body></html>`;

describe("dnd.su parser", () => {
  it("parses a spell card", () => {
    const { document } = parseHTML(page);
    const s = parseSpellDocument(document as unknown as Document, "https://dnd.su/spells/42-secret_mark/");
    expect(s).toMatchObject({
      source: "dndsu",
      externalId: "42",
      nameRu: "Тайный знак",
      nameEn: "Secret Mark",
      level: 1,
      school: "прорицание",
      ritual: true,
      concentration: true,
      castingTime: "1 действие",
      range: "60 футов",
      components: "В, С, М (щепотка соли)",
      classes: ["волшебник", "друид"],
      subclasses: ["клятвопреступник (паладин)"],
      sourceBook: "Player's Handbook",
    });
    const types = (s.description.content ?? []).map((n) => n.type);
    expect(types).toEqual(["paragraph", "bulletList", "table", "paragraph"]);
    const json = JSON.stringify(s.description);
    expect(json).toContain('"href":"https://dnd.su/spells/10-acid/"');
    expect(json).toContain('"type":"bold"');
    expect(docToText(s.description)).toContain("На больших уровнях.");
  });

  it("parses cantrips and pages without the data-copy attribute", () => {
    const html = page
      .replace('<span data-copy="Тайный знак [Secret Mark]">Тайный знак</span>', "Брызги кислоты [Acid Splash]")
      .replace("1 уровень, прорицание (ритуал)", "Заговор, вызов");
    const { document } = parseHTML(html);
    const s = parseSpellDocument(document as unknown as Document, "https://dnd.su/spells/10-acid_splash/");
    expect(s.nameRu).toBe("Брызги кислоты");
    expect(s.nameEn).toBe("Acid Splash");
    expect(s.level).toBe(0);
    expect(s.school).toBe("вызов");
    expect(s.ritual).toBe(false);
  });

  it("fails loudly on pages without a spell card", () => {
    const { document } = parseHTML("<html><body><p>Проверка браузера</p></body></html>");
    expect(() => parseSpellDocument(document as unknown as Document, "https://dnd.su/spells/1-x/")).toThrow();
  });

  it("discovers spell urls in sitemaps", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://dnd.su/spells/2-second/</loc></url>
      <url><loc>https://dnd.su/spells/1-first/</loc></url>
      <url><loc>https://dnd.su/homebrew/spells/3-hb/</loc></url>
      <url><loc>https://dnd.su/spells/</loc></url>
      <url><loc>https://dnd.su/bestiary/5-goblin/</loc></url>
    </urlset>`;
    expect(discoverSpellUrls(xml)).toEqual(["https://dnd.su/spells/1-first/", "https://dnd.su/spells/2-second/"]);
    expect(discoverSpellUrls(xml, ["dndsu", "dndsu-homebrew"])).toHaveLength(3);
    expect(childSitemaps("<sitemapindex><sitemap><loc>https://dnd.su/sitemap-1.xml</loc></sitemap></sitemapindex>")).toEqual([
      "https://dnd.su/sitemap-1.xml",
    ]);
    expect(classifySpellUrl("https://next.dnd.su/spells/7-fireball/")).toEqual({ source: "next-dndsu", id: "7" });
    expect(classifySpellUrl("https://www.dnd.su/spells/7-fireball/")).toEqual({ source: "dndsu", id: "7" });
  });

  it("converts spellbook-builder records", () => {
    const s = fromSpellbookRecord({
      id: "dndsu-1",
      numeric_id: 1,
      name_ru: "Адское возмездие",
      name_en: "Hellish rebuke",
      level: 1,
      school: "воплощение",
      ritual: false,
      concentration: false,
      casting_time: "1 реакция",
      range: "60 футов",
      components: "В, С",
      duration: "Мгновенная",
      classes: ["колдун"],
      subclasses: [],
      content_blocks: [
        { type: "paragraph", text: "Существо окружается пламенем." },
        { type: "list", text: "• Раз\n• Два" },
      ],
      source_book: "Player's Handbook",
      source_url: "https://dnd.su/spells/1-hellish_rebuke/",
    });
    expect(s?.externalId).toBe("1");
    expect(s?.description.content?.[1].type).toBe("bulletList");
  });
});
