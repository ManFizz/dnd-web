import type { RichDoc, RichMark, RichNode } from "@/lib/rules/richtext";

// Parser for spell pages of dnd.su. It only uses standard DOM APIs so the
// same code runs on the server (linkedom) and in the browser (DOMParser).

export type SpellSource = "dndsu" | "dndsu-homebrew" | "next-dndsu";

export type ParsedSpell = {
  source: SpellSource;
  externalId: string;
  url: string;
  nameRu: string;
  nameEn: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  classes: string[];
  subclasses: string[];
  sourceBook: string;
  description: RichDoc;
};

export class DndSuParseError extends Error {}

const SITES: { host: string; source: SpellSource; path: RegExp }[] = [
  { host: "next.dnd.su", source: "next-dndsu", path: /^\/spells\/(\d+)-[^/]+\/?$/ },
  { host: "dnd.su", source: "dndsu-homebrew", path: /^\/homebrew\/spells\/(\d+)-[^/]+\/?$/ },
  { host: "dnd.su", source: "dndsu", path: /^\/spells\/(\d+)-[^/]+\/?$/ },
];

/** Identify a spell page URL: returns its source and numeric id. */
export function classifySpellUrl(url: string): { source: SpellSource; id: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  for (const site of SITES) {
    if (site.host !== host) continue;
    const m = site.path.exec(u.pathname);
    if (m) return { source: site.source, id: m[1] };
  }
  return null;
}

/** Spell page URLs from a sitemap (sorted by numeric id, unique). */
export function discoverSpellUrls(sitemapXml: string, sources: SpellSource[] = ["dndsu"]): string[] {
  const found = new Map<string, { url: string; id: number }>();
  for (const m of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1].replace(/&amp;/g, "&");
    const c = classifySpellUrl(url);
    if (!c || !sources.includes(c.source)) continue;
    found.set(`${c.source}:${c.id}`, { url, id: Number(c.id) });
  }
  return [...found.values()].sort((a, b) => a.id - b.id).map((x) => x.url);
}

/** Child sitemaps listed in a sitemap index. */
export function childSitemaps(xml: string): string[] {
  if (!/<sitemapindex/i.test(xml)) return [];
  return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/ /g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();

const LEVEL_RE = /^(?:(\d+)[-\s]*(?:й\s*)?уровень|(заговор))\s*,\s*(.+)$/i;
const TITLE_RE = /^(.*?)\s*\[([^\]]+)\]\s*$/;

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function inlineNodes(el: Node, base: string, marks: RichMark[] = []): RichNode[] {
  const out: RichNode[] = [];
  el.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? "").replace(/ /g, " ").replace(/[\t\r\n]+/g, " ");
      if (text) out.push(marks.length ? { type: "text", text, marks: [...marks] } : { type: "text", text });
      return;
    }
    if (child.nodeType !== 1) return;
    const e = child as Element;
    const tag = e.tagName.toLowerCase();
    if (tag === "br") {
      out.push({ type: "hardBreak" });
      return;
    }
    if (tag === "script" || tag === "style" || tag === "button" || tag === "svg") return;
    let next = marks;
    if (tag === "strong" || tag === "b") next = [...marks, { type: "bold" }];
    else if (tag === "em" || tag === "i") next = [...marks, { type: "italic" }];
    else if (tag === "u") next = [...marks, { type: "underline" }];
    else if (tag === "s" || tag === "del") next = [...marks, { type: "strike" }];
    else if (tag === "a") {
      const href = absolute(e.getAttribute("href") ?? "", base);
      if (href) next = [...marks, { type: "link", attrs: { href, target: "_blank" } }];
    }
    out.push(...inlineNodes(e, base, next));
  });
  return out;
}

function mergeText(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "text" && n.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      prev.text = (prev.text ?? "") + (n.text ?? "");
    } else out.push({ ...n });
  }
  // Trim whitespace at the edges of a block.
  if (out[0]?.type === "text") out[0].text = (out[0].text ?? "").replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.type === "text") last.text = (last.text ?? "").replace(/\s+$/, "");
  return out.filter((n) => n.type !== "text" || n.text);
}

function paragraph(el: Element, base: string): RichNode {
  const content = mergeText(inlineNodes(el, base));
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function blockNodes(el: Element, base: string): RichNode[] {
  const out: RichNode[] = [];
  let inline: Node[] = [];
  const flushInline = () => {
    if (!inline.length) return;
    const wrapper = el.ownerDocument.createElement("p");
    inline.forEach((n) => wrapper.appendChild(n.cloneNode(true)));
    const p = paragraph(wrapper, base);
    if (p.content?.length) out.push(p);
    inline = [];
  };
  el.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      if (clean(child.textContent)) inline.push(child);
      return;
    }
    if (child.nodeType !== 1) return;
    const e = child as Element;
    const tag = e.tagName.toLowerCase();
    if (["strong", "b", "em", "i", "a", "span", "u", "s", "br", "sup", "sub", "small"].includes(tag)) {
      inline.push(e);
      return;
    }
    flushInline();
    if (tag === "p") out.push(paragraph(e, base));
    else if (/^h[1-6]$/.test(tag)) {
      const content = mergeText(inlineNodes(e, base));
      if (content.length) out.push({ type: "heading", attrs: { level: Math.min(4, Math.max(3, Number(tag[1]))) }, content });
    } else if (tag === "ul" || tag === "ol") {
      const items: RichNode[] = [];
      e.querySelectorAll(":scope > li").forEach((li) => {
        const inner = blockNodes(li, base);
        items.push({ type: "listItem", content: inner.length ? inner : [{ type: "paragraph" }] });
      });
      if (items.length) out.push({ type: tag === "ul" ? "bulletList" : "orderedList", content: items });
    } else if (tag === "table") {
      const rows: RichNode[] = [];
      e.querySelectorAll("tr").forEach((tr) => {
        const cells: RichNode[] = [];
        tr.querySelectorAll("th, td").forEach((cell) => {
          const p = paragraph(cell, base);
          cells.push({ type: cell.tagName.toLowerCase() === "th" ? "tableHeader" : "tableCell", content: [p] });
        });
        if (cells.length) rows.push({ type: "tableRow", content: cells });
      });
      if (rows.length) out.push({ type: "table", content: rows });
    } else if (tag === "blockquote") {
      const inner = blockNodes(e, base);
      if (inner.length) out.push({ type: "blockquote", content: inner });
    } else if (tag === "hr") out.push({ type: "horizontalRule" });
    else if (tag === "script" || tag === "style" || tag === "button" || tag === "svg" || tag === "img") return;
    else out.push(...blockNodes(e, base));
  });
  flushInline();
  return out;
}

/** Convert an HTML element into our rich text document. */
export function elementToDoc(el: Element, base: string): RichDoc {
  const content = blockNodes(el, base);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => clean(s).replace(/\s+[A-Z]{2,5}$/, ""))
    .filter(Boolean);
}

/** Parse one spell page. `document` is a DOM Document of the page. */
export function parseSpellDocument(document: Document, url: string): ParsedSpell {
  const where = classifySpellUrl(url);
  const card =
    document.querySelector('.card[data-id^="spells:"]') ??
    document.querySelector('.card[data-id*="spells"]') ??
    [...document.querySelectorAll(".card")].find((c) => c.querySelector("ul.params")) ??
    null;
  if (!card) throw new DndSuParseError(`Не найдена карточка заклинания: ${url}`);

  const dataId = card.getAttribute("data-id") ?? "";
  const idFromCard = /:(\d+)$/.exec(dataId)?.[1];
  const id = where?.id ?? idFromCard;
  if (!id) throw new DndSuParseError(`Не удалось определить номер заклинания: ${url}`);

  const titleEl = card.querySelector(".card-title [data-copy]") ?? card.querySelector(".card-title") ?? card.querySelector("h1, h2");
  let title = clean(titleEl?.getAttribute("data-copy"));
  if (!title && titleEl) {
    const copy = titleEl.cloneNode(true) as Element;
    copy.querySelectorAll(".source-plaque").forEach((n) => n.remove());
    title = clean(copy.textContent);
  }
  if (!title) throw new DndSuParseError(`Не найдено название: ${url}`);
  const tm = TITLE_RE.exec(title);
  const nameRu = clean(tm ? tm[1] : title);
  const nameEn = clean(tm ? tm[2] : "");

  const params = card.querySelector("[itemprop='articleBody'] ul.params") ?? card.querySelector("ul.params");
  if (!params) throw new DndSuParseError(`Не найдены параметры: ${url}`);
  const items = [...params.querySelectorAll(":scope > li")];
  if (!items.length) throw new DndSuParseError(`Пустые параметры: ${url}`);

  let level = -1;
  let school = "";
  let ritual = false;
  const fields: Record<string, string> = {};
  let descEl: Element | null = null;
  for (const li of items) {
    if (li.classList.contains("desc") || li.querySelector("[itemprop='description']")) {
      descEl = li.querySelector("[itemprop='description']") ?? li;
      continue;
    }
    const strong = li.querySelector("strong");
    if (strong) {
      const label = clean(strong.textContent).replace(/:$/, "");
      const copy = li.cloneNode(true) as Element;
      copy.querySelector("strong")?.remove();
      fields[label] = clean(copy.textContent).replace(/^:\s*/, "");
      continue;
    }
    const text = clean(li.textContent);
    const lm = LEVEL_RE.exec(text);
    if (lm && level < 0) {
      level = lm[2] ? 0 : Number(lm[1]);
      school = clean(lm[3]);
      if (/ритуал/i.test(school)) {
        ritual = true;
        school = clean(school.replace(/\(?\s*ритуал\s*\)?/i, ""));
      }
    }
  }
  if (level < 0) throw new DndSuParseError(`Не удалось определить уровень заклинания: ${url}`);
  if (!descEl) throw new DndSuParseError(`Не найдено описание: ${url}`);

  const plaque = card.querySelector(".card-title .source-plaque:not(a)") ?? card.querySelector(".source-plaque");
  const duration = fields["Длительность"] ?? "";
  return {
    source: where?.source ?? "dndsu",
    externalId: id,
    url,
    nameRu,
    nameEn,
    level,
    school: school.toLowerCase(),
    ritual,
    concentration: /^концентрация/i.test(duration),
    castingTime: fields["Время накладывания"] ?? fields["Время сотворения"] ?? "",
    range: fields["Дистанция"] ?? "",
    components: fields["Компоненты"] ?? "",
    duration,
    classes: splitList(fields["Классы"] ?? ""),
    subclasses: splitList(fields["Подклассы"] ?? fields["Архетипы"] ?? ""),
    sourceBook: clean(plaque?.getAttribute("title")) || clean(fields["Источник"]),
    description: elementToDoc(descEl, url),
  };
}

export function spellSearchText(s: Pick<ParsedSpell, "nameRu" | "nameEn" | "classes" | "school">): string {
  return [s.nameRu, s.nameEn, s.school, ...s.classes].join(" ").toLowerCase().replace(/ё/g, "е");
}
