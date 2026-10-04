import "server-only";
import { parseHTML } from "linkedom";
import type { ParsedCreature } from "@/lib/bestiary";
import { classifyCreatureUrl, discoverCreatureUrls, parseCreatureDocument } from "@/lib/import/dndsu/bestiary";
import { childSitemaps, classifySpellUrl, discoverSpellUrls, parseSpellDocument, type ParsedSpell, type SpellSource } from "@/lib/import/dndsu/parse";

// Server-side crawler for dnd.su. It follows redirects manually and keeps
// cookies, because the site answers bots with cookie based redirects.

const USER_AGENT = "Mozilla/5.0 (compatible; dnd-web-spell-import/1.0; +https://github.com/ManFizz/dnd-web)";
const ALLOWED_HOSTS = new Set(["dnd.su", "www.dnd.su", "next.dnd.su"]);
const SITEMAPS: Record<SpellSource, string> = {
  dndsu: "https://dnd.su/sitemap.xml",
  "dndsu-homebrew": "https://dnd.su/sitemap.xml",
  "next-dndsu": "https://next.dnd.su/sitemap.xml",
};

type Jar = Map<string, string>;

function storeCookies(res: Response, jar: Jar) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

export async function fetchDndSu(url: string, jar: Jar = new Map()): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    const host = new URL(current).hostname;
    if (!ALLOWED_HOSTS.has(host)) throw new Error(`Переход на посторонний сайт: ${host}`);
    const res = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru,en;q=0.7",
        ...(jar.size ? { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    storeCookies(res, jar);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Перенаправление без адреса: ${current}`);
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`dnd.su ответил ${res.status} на ${current}`);
    return await res.text();
  }
  throw new Error("dnd.su перенаправляет по кругу (вероятно, защита от ботов). Используйте импорт через браузер.");
}

export async function discoverDndSu(sources: SpellSource[]): Promise<string[]> {
  const jar: Jar = new Map();
  const roots = [...new Set(sources.map((s) => SITEMAPS[s]))];
  const urls: string[] = [];
  for (const root of roots) {
    const xml = await fetchDndSu(root, jar);
    const children = childSitemaps(xml);
    const docs = children.length ? [] : [xml];
    for (const child of children.slice(0, 50)) docs.push(await fetchDndSu(child, jar));
    for (const d of docs) urls.push(...discoverSpellUrls(d, sources));
  }
  return [...new Set(urls)];
}

export async function fetchSpells(urls: string[], delayMs = 350): Promise<{ url: string; spell?: ParsedSpell; error?: string }[]> {
  const jar: Jar = new Map();
  const out: { url: string; spell?: ParsedSpell; error?: string }[] = [];
  for (const [idx, url] of urls.entries()) {
    if (!classifySpellUrl(url)) {
      out.push({ url, error: "Это не адрес заклинания dnd.su" });
      continue;
    }
    if (idx > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const html = await fetchDndSu(url, jar);
      const { document } = parseHTML(html);
      out.push({ url, spell: parseSpellDocument(document as unknown as Document, url) });
    } catch (e) {
      out.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export async function discoverBestiary(sources: ParsedCreature["source"][]): Promise<string[]> {
  const jar: Jar = new Map();
  const xml = await fetchDndSu("https://dnd.su/sitemap.xml", jar);
  const children = childSitemaps(xml);
  const docs = children.length ? [] : [xml];
  for (const child of children.slice(0, 50)) docs.push(await fetchDndSu(child, jar));
  return [...new Set(docs.flatMap((d) => discoverCreatureUrls(d, sources)))];
}

export async function fetchCreatures(urls: string[], delayMs = 350): Promise<{ url: string; creature?: ParsedCreature; error?: string }[]> {
  const jar: Jar = new Map();
  const out: { url: string; creature?: ParsedCreature; error?: string }[] = [];
  for (const [idx, url] of urls.entries()) {
    if (!classifyCreatureUrl(url)) {
      out.push({ url, error: "Это не адрес существа dnd.su" });
      continue;
    }
    if (idx > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const { document } = parseHTML(await fetchDndSu(url, jar));
      out.push({ url, creature: parseCreatureDocument(document as unknown as Document, url) });
    } catch (e) {
      out.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
