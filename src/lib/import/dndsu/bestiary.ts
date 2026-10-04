import type { Abilities, ParsedCreature } from "@/lib/bestiary";
import { normalizeType, parseCr, sizeFromRu } from "@/lib/creatures";
import { DndSuParseError, elementToDoc } from "./parse";

// Parser for bestiary pages of dnd.su. Like the spell parser it uses only
// standard DOM APIs (server: linkedom, browser: DOMParser). The statblock
// layout is read from text with tolerant patterns, so a cosmetic change of
// the site's markup keeps working; the whole statblock is also kept as rich
// text for the GM to read.

const SITES: { source: ParsedCreature["source"]; path: RegExp }[] = [
  { source: "dndsu-homebrew", path: /^\/homebrew\/bestiary\/(\d+)-[^/]+\/?$/ },
  { source: "dndsu", path: /^\/bestiary\/(\d+)-[^/]+\/?$/ },
];

export function classifyCreatureUrl(url: string): { source: ParsedCreature["source"]; id: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname.replace(/^www\./, "") !== "dnd.su") return null;
  for (const site of SITES) {
    const m = site.path.exec(u.pathname);
    if (m) return { source: site.source, id: m[1] };
  }
  return null;
}

export function discoverCreatureUrls(sitemapXml: string, sources: ParsedCreature["source"][] = ["dndsu"]): string[] {
  const found = new Map<string, { url: string; id: number }>();
  for (const m of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1].replace(/&amp;/g, "&");
    const c = classifyCreatureUrl(url);
    if (!c || !sources.includes(c.source)) continue;
    found.set(`${c.source}:${c.id}`, { url, id: Number(c.id) });
  }
  return [...found.values()].sort((a, b) => a.id - b.id).map((x) => x.url);
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();

const ABILITY_KEYS: [keyof Abilities, RegExp][] = [
  ["str", /СИЛ/i],
  ["dex", /ЛОВ/i],
  ["con", /ТЕЛ/i],
  ["int", /ИНТ/i],
  ["wis", /МДР/i],
  ["cha", /ХАР/i],
];

/** "СИЛ 8 (-1) ЛОВ 14 (+2) ..." → scores, or null when the six are not all there. */
export function parseAbilities(text: string): Abilities | null {
  const t = clean(text);
  const out: Partial<Abilities> = {};
  for (const [key, label] of ABILITY_KEYS) {
    const m = new RegExp(`${label.source}\\s*:?\\s*(\\d{1,2})\\s*\\(`, "i").exec(t);
    if (m) out[key] = Number(m[1]);
  }
  if (Object.keys(out).length === 6) return out as Abilities;
  // Plain sequence of six "N (+M)" in order.
  const seq = [...t.matchAll(/(\d{1,2})\s*\(\s*[+-]?\d+\s*\)/g)].map((m) => Number(m[1]));
  if (seq.length >= 6) {
    const [str, dex, con, int, wis, cha] = seq;
    return { str, dex, con, int, wis, cha };
  }
  return null;
}

/** First line of a statblock: "Маленький гуманоид (гоблиноид), нейтрально-злой". */
export function parseSizeLine(text: string): { size: ParsedCreature["size"]; type: string; alignment: string } | null {
  const t = clean(text);
  const m = /^(\S+)\s+([^,]+?)(?:,\s*(.+))?$/.exec(t);
  if (!m) return null;
  const size = sizeFromRu(m[1]);
  if (!size) return null;
  return { size, type: normalizeType(m[2]), alignment: (m[3] ?? "").trim() };
}

/** Fields of a creature read from the plain text lines of its statblock. */
export function parseStatLines(lines: string[]) {
  const out = {
    size: "" as ParsedCreature["size"],
    type: "",
    alignment: "",
    ac: 10,
    hp: 1,
    hpFormula: "",
    speed: "",
    cr: NaN,
    abilities: null as Abilities | null,
  };
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    if (!out.size) {
      const s = parseSizeLine(line);
      if (s) {
        Object.assign(out, s);
        continue;
      }
    }
    let m: RegExpExecArray | null;
    if ((m = /^класс\s+доспеха\s*:?\s*(\d+)/i.exec(line))) out.ac = Number(m[1]);
    else if ((m = /^хиты\s*:?\s*(\d+)(?:\s*\(([^)]*)\))?/i.exec(line))) {
      out.hp = Number(m[1]);
      out.hpFormula = (m[2] ?? "").replace(/к/g, "d").replace(/\s+/g, "");
    } else if ((m = /^скорость\s*:?\s*(.+)$/i.exec(line))) out.speed = m[1];
    else if ((m = /^опасность\s*:?\s*(\d+(?:\s*\/\s*\d+)?)/i.exec(line))) out.cr = parseCr(m[1]);
    else if (!out.abilities && /СИЛ/.test(line) && /ХАР/.test(line)) out.abilities = parseAbilities(line);
  }
  return out;
}

/** Lines of text of each direct item of the statblock list (or of its paragraphs). */
function statLines(card: Element): string[] {
  const params = card.querySelector("ul.params");
  const nodes = params ? [...params.querySelectorAll(":scope > li")] : [...card.querySelectorAll("p, li")];
  const lines: string[] = [];
  for (const n of nodes) {
    // The ability table is a grid of divs; join its cells with spaces.
    const stats = n.querySelector(".stats, table");
    if (stats) {
      const cells = [...stats.querySelectorAll("div, td, th")].filter((c) => !c.querySelector("div, td, th"));
      lines.push(cells.map((c) => c.textContent ?? "").join(" "));
    }
    lines.push(n.textContent ?? "");
  }
  return lines;
}

export function parseCreatureDocument(document: Document, url: string): ParsedCreature {
  const where = classifyCreatureUrl(url);
  if (!where) throw new DndSuParseError("Это не адрес существа dnd.su");
  const card =
    document.querySelector('.card[data-id^="bestiary:"]') ??
    document.querySelector('.card[data-id*="bestiary"]') ??
    [...document.querySelectorAll(".card")].find((c) => /Опасность/i.test(c.textContent ?? "")) ??
    null;
  if (!card) throw new DndSuParseError("На странице нет карточки существа");

  const titleEl = card.querySelector(".card-title [data-copy]") ?? card.querySelector(".card-title") ?? card.querySelector("h1, h2");
  let title = "";
  if (titleEl) {
    const copy = titleEl.cloneNode(true) as Element;
    copy.querySelectorAll(".source-plaque").forEach((n) => n.remove());
    title = clean(titleEl.getAttribute("data-copy") ?? copy.textContent);
  }
  const t = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(title);
  const nameRu = clean(t ? t[1] : title);
  const nameEn = clean(t ? t[2] : "");
  if (!nameRu) throw new DndSuParseError("Не нашлось имя существа");

  const stats = parseStatLines(statLines(card));
  if (!Number.isFinite(stats.cr)) throw new DndSuParseError(`«${nameRu}»: не нашлась опасность`);
  const plaque = card.querySelector(".card-title .source-plaque") ?? card.querySelector(".source-plaque");
  const body = card.querySelector("[itemprop='articleBody']") ?? card.querySelector(".card-body") ?? card;

  return {
    source: where.source,
    externalId: where.id,
    url,
    nameRu,
    nameEn,
    size: stats.size,
    type: stats.type,
    alignment: stats.alignment,
    cr: stats.cr,
    ac: stats.ac,
    hp: stats.hp,
    hpFormula: stats.hpFormula,
    speed: stats.speed,
    abilities: stats.abilities,
    sourceBook: clean(plaque?.getAttribute("title") ?? plaque?.textContent),
    statblock: elementToDoc(body, url),
  };
}
