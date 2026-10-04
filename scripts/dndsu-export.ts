import { childSitemaps, discoverSpellUrls, parseSpellDocument, type ParsedSpell, type SpellSource } from "../src/lib/import/dndsu/parse";

// Browser console script. Run it on dnd.su (or next.dnd.su) to download every
// spell into a JSON file, then upload that file on the spell import page.
// It only reads public pages of the site you are on, at a polite pace.

type Failure = { url: string; error: string };

const CONCURRENCY = 3;
const PAUSE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function panel() {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;width:340px;padding:14px 16px;border-radius:12px;" +
    "background:#16181d;color:#e8e6e3;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)";
  const title = document.createElement("div");
  title.textContent = "Экспорт заклинаний для «Листа героя»";
  title.style.cssText = "font-weight:600;margin-bottom:8px";
  const text = document.createElement("div");
  const bar = document.createElement("div");
  bar.style.cssText = "height:6px;border-radius:3px;background:#2c2f36;margin:10px 0;overflow:hidden";
  const fill = document.createElement("div");
  fill.style.cssText = "height:100%;width:0;background:#c9a227;transition:width .2s";
  bar.appendChild(fill);
  const stop = document.createElement("button");
  stop.textContent = "Остановить и скачать то, что есть";
  stop.style.cssText = "all:unset;cursor:pointer;color:#c9a227;font-size:13px";
  box.append(title, text, bar, stop);
  document.body.appendChild(box);
  return {
    set(message: string, progress?: number) {
      text.textContent = message;
      if (progress !== undefined) fill.style.width = `${Math.round(progress * 100)}%`;
    },
    onStop(fn: () => void) {
      stop.addEventListener("click", fn);
    },
    done() {
      stop.remove();
      setTimeout(() => box.remove(), 15000);
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Sitemaps may list another host variant (www); always fetch from the current origin. */
const local = (url: string) => {
  const u = new URL(url);
  return `${location.origin}${u.pathname}${u.search}`;
};

function download(spells: ParsedSpell[], failed: Failure[]) {
  const payload = {
    format: "dnd-web-spells",
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    failed,
    spells,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `spells-${location.hostname}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function main() {
  const host = location.hostname.replace(/^www\./, "");
  if (host !== "dnd.su" && host !== "next.dnd.su") {
    alert("Откройте любую страницу dnd.su (или next.dnd.su) и запустите скрипт там.");
    return;
  }
  const sources: SpellSource[] =
    host === "next.dnd.su" ? ["next-dndsu"] : confirm("Добавить хоумбрю-заклинания с dnd.su/homebrew?") ? ["dndsu", "dndsu-homebrew"] : ["dndsu"];

  const ui = panel();
  let stopped = false;
  ui.onStop(() => {
    stopped = true;
  });

  ui.set("Читаю карту сайта…");
  const root = await fetchText(`${location.origin}/sitemap.xml`);
  const children = childSitemaps(root);
  const maps = children.length ? [] : [root];
  for (const child of children) {
    if (stopped) break;
    try {
      maps.push(await fetchText(local(child)));
    } catch (e) {
      console.warn("Карта сайта не загрузилась", child, e);
    }
  }
  const urls = [...new Set(maps.flatMap((xml) => discoverSpellUrls(xml, sources)))];
  if (!urls.length) {
    ui.set("В карте сайта не нашлось заклинаний. Возможно, сайт изменился.");
    ui.done();
    return;
  }

  const spells: ParsedSpell[] = [];
  const failed: Failure[] = [];
  const parser = new DOMParser();
  const queue = [...urls];
  let done = 0;

  const worker = async () => {
    while (queue.length && !stopped) {
      const url = queue.shift()!;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const html = await fetchText(local(url));
          spells.push(parseSpellDocument(parser.parseFromString(html, "text/html"), url));
          break;
        } catch (e) {
          if (attempt === 3) failed.push({ url, error: e instanceof Error ? e.message : String(e) });
          else await sleep(1500 * attempt);
        }
      }
      done++;
      ui.set(`Заклинаний: ${spells.length} из ${urls.length}${failed.length ? `, ошибок: ${failed.length}` : ""}`, done / urls.length);
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  spells.sort((a, b) => a.level - b.level || a.nameRu.localeCompare(b.nameRu, "ru"));
  download(spells, failed);
  ui.set(
    `Готово: ${spells.length} заклинаний${failed.length ? `, не удалось: ${failed.length} (список в файле)` : ""}. Загрузите скачанный файл на странице импорта.`,
    1,
  );
  ui.done();
  if (failed.length) console.table(failed);
}

main().catch((e) => {
  console.error(e);
  alert(`Экспорт остановлен: ${e instanceof Error ? e.message : e}`);
});
