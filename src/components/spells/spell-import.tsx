"use client";

import { Check, ClipboardCopy, CloudDownload, Download, FileUp, Globe, Loader2, Square, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { SOURCE_LABELS } from "@/lib/spells";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Panel } from "@/components/ui/misc";

type SourceId = "dndsu" | "next-dndsu" | "dndsu-homebrew";
type Failure = { url: string; error: string };
type Totals = { created: number; updated: number; failed: number; rejected: number };

const SOURCES: { id: SourceId; label: string; hint: string }[] = [
  { id: "dndsu", label: "dnd.su", hint: "Заклинания 5e (2014) из официальных книг" },
  { id: "next-dndsu", label: "next.dnd.su", hint: "Заклинания редакции 2024" },
  { id: "dndsu-homebrew", label: "Хоумбрю dnd.su", hint: "Пользовательские заклинания с сайта" },
];

const BATCH = 12;
/** Upload chunks stay well below the ~4 MB request limit of hosting platforms. */
const MAX_CHUNK_BYTES = 2_500_000;
const MAX_CHUNK_ITEMS = 150;

const zero = (): Totals => ({ created: 0, updated: 0, failed: 0, rejected: 0 });

async function apiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Ошибка ${res.status}`;
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-panel-3">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted tabular-nums">
        {done} из {total} ({pct}%)
      </div>
    </div>
  );
}

function TotalsLine({ totals }: { totals: Totals }) {
  return (
    <p className="text-sm tabular-nums">
      <span className="text-good">Новых: {totals.created}</span> · <span>Обновлено: {totals.updated}</span>
      {totals.failed > 0 && <span className="text-danger"> · Ошибок: {totals.failed}</span>}
      {totals.rejected > 0 && <span className="text-danger"> · Отклонено: {totals.rejected}</span>}
    </p>
  );
}

/** Splits upload entries into request-sized chunks. */
function chunkEntries<T>(entries: T[]): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const e of entries) {
    const len = JSON.stringify(e).length;
    if (cur.length && (size + len > MAX_CHUNK_BYTES || cur.length >= MAX_CHUNK_ITEMS)) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(e);
    size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function SpellImport() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const loadStats = useCallback(async () => {
    const res = await fetch("/api/spells?stats", { cache: "no-store" });
    if (res.ok) setStats(((await res.json()) as { stats: Record<string, number> }).stats);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/spells?stats", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ stats: Record<string, number> }>) : null))
      .then((d) => !cancelled && d && setStats(d.stats))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Загрузка заклинаний</h1>
        <p className="mt-1 text-muted">
          Общая библиотека для всех игроков сайта.{" "}
          {stats &&
            (Object.keys(stats).length
              ? `Сейчас в ней: ${Object.entries(stats)
                  .map(([src, n]) => `${SOURCE_LABELS[src] ?? src} ${n}`)
                  .join(", ")}.`
              : "Сейчас она пуста.")}{" "}
          Повторная загрузка обновит заклинания, а не продублирует их.
        </p>
      </div>
      <ServerImport onDone={loadStats} />
      <BrowserScript />
      <FileUpload onDone={loadStats} />
    </div>
  );
}

function ServerImport({ onDone }: { onDone: () => void }) {
  const [sources, setSources] = useState<SourceId[]>(["dndsu"]);
  const [urls, setUrls] = useState<string[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [totals, setTotals] = useState<Totals>(zero);
  const [failures, setFailures] = useState<Failure[]>([]);
  const stopRef = useRef(false);

  const discover = async () => {
    setDiscovering(true);
    setError(null);
    setUrls(null);
    try {
      const res = await fetch("/api/spells/dndsu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "discover", sources }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      setUrls(((await res.json()) as { urls: string[] }).urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setDiscovering(false);
    }
  };

  const run = async (list: string[]) => {
    stopRef.current = false;
    setRunning(true);
    setDone(0);
    setTotals(zero());
    setFailures([]);
    setError(null);
    let consecutiveErrors = 0;
    for (let i = 0; i < list.length; i += BATCH) {
      if (stopRef.current) break;
      const batch = list.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/spells/dndsu", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "import", urls: batch }),
        });
        if (!res.ok) throw new Error(await apiError(res));
        const data = (await res.json()) as { created: number; updated: number; results: { url: string; ok: boolean; error?: string }[] };
        const failed = data.results.filter((r) => !r.ok).map((r) => ({ url: r.url, error: r.error ?? "Ошибка" }));
        setTotals((t) => ({ ...t, created: t.created + data.created, updated: t.updated + data.updated, failed: t.failed + failed.length }));
        setFailures((f) => [...f, ...failed]);
        consecutiveErrors = failed.length === batch.length ? consecutiveErrors + 1 : 0;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Ошибка";
        setTotals((t) => ({ ...t, failed: t.failed + batch.length }));
        setFailures((f) => [...f, ...batch.map((url) => ({ url, error: message }))]);
        consecutiveErrors++;
      }
      setDone(Math.min(list.length, i + BATCH));
      if (consecutiveErrors >= 3) {
        setError("Три пачки подряд не загрузились: похоже, dnd.su не пускает сервер. Попробуйте способ через браузер.");
        break;
      }
    }
    setRunning(false);
    onDone();
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <CloudDownload className="size-4 text-accent" /> С сервера
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Сервер сам обойдёт страницы заклинаний на dnd.su, не спеша, пачками по {BATCH}. Вкладку нужно держать открытой.</p>
        <div className="flex flex-col gap-1.5">
          {SOURCES.map((s) => (
            <Checkbox
              key={s.id}
              checked={sources.includes(s.id)}
              disabled={running || discovering}
              onChange={(e) => setSources((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
              label={
                <span>
                  {s.label} <span className="text-xs text-faint">{s.hint}</span>
                </span>
              }
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={discover} disabled={!sources.length || discovering || running}>
            {discovering ? <Loader2 className="animate-spin" /> : <Globe />}
            Найти заклинания
          </Button>
          {urls && !running && (
            <Button variant="primary" onClick={() => run(urls)} disabled={!urls.length}>
              <Download /> Загрузить {urls.length}
            </Button>
          )}
          {running && (
            <Button variant="danger" onClick={() => (stopRef.current = true)}>
              <Square /> Остановить
            </Button>
          )}
          {urls && <span className="text-sm text-muted">Найдено страниц: {urls.length}</span>}
        </div>
        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        {(running || done > 0) && urls && (
          <>
            <Progress done={done} total={urls.length} />
            <TotalsLine totals={totals} />
          </>
        )}
        {failures.length > 0 && !running && (
          <details className="text-sm">
            <summary className="cursor-pointer text-danger">Не загрузились: {failures.length}</summary>
            <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-muted">
              {failures.slice(0, 300).map((f) => (
                <li key={f.url} className="truncate">
                  {f.url}: {f.error}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => run(failures.map((f) => f.url))}>
              Повторить неудачные
            </Button>
          </details>
        )}
      </div>
    </Panel>
  );
}

function BrowserScript() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const res = await fetch("/tools/dndsu-export.js", { cache: "no-store" });
      if (!res.ok) throw new Error("Скрипт не найден: соберите проект командой npm run build");
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      toast.success("Скрипт скопирован");
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось скопировать");
    }
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Globe className="size-4 text-accent" /> Через браузер
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">Если dnd.su не пускает сервер (защита от ботов), заклинания можно собрать в вашем браузере, а файл загрузить ниже.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Скопируйте скрипт.{" "}
            <a href="/tools/dndsu-export.js" target="_blank" className="text-info hover:underline">
              Его код можно посмотреть
            </a>
            : он только читает открытые страницы сайта и сохраняет файл.
          </li>
          <li>
            Откройте{" "}
            <a href="https://dnd.su/spells/" target="_blank" rel="noopener noreferrer" className="text-info hover:underline">
              dnd.su/spells
            </a>{" "}
            (или next.dnd.su для 2024) в этом же браузере.
          </li>
          <li>Откройте консоль разработчика (F12, вкладка Console), вставьте скрипт и нажмите Enter. Chrome может попросить сначала ввести «allow pasting».</li>
          <li>Дождитесь окончания: браузер скачает файл spells-dnd.su-….json.</li>
          <li>Загрузите этот файл в блоке ниже.</li>
        </ol>
        <Button className="self-start" onClick={copy}>
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? "Скопировано" : "Скопировать скрипт"}
        </Button>
      </div>
    </Panel>
  );
}

function FileUpload({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    setError(null);
    setTotals(null);
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setError("Файл не читается как JSON");
      return;
    }
    // Same shapes as the server accepts: { spells: [...] }, a bare array, or { records: {...} }.
    let chunks: unknown[];
    if (Array.isArray(raw)) chunks = chunkEntries(raw).map((c) => ({ spells: c }));
    else if (raw && typeof raw === "object" && Array.isArray((raw as { spells?: unknown }).spells))
      chunks = chunkEntries((raw as { spells: unknown[] }).spells).map((c) => ({ spells: c }));
    else if (raw && typeof raw === "object" && (raw as { records?: unknown }).records && typeof (raw as { records: unknown }).records === "object")
      chunks = chunkEntries(Object.entries((raw as { records: Record<string, unknown> }).records)).map((c) => ({ records: Object.fromEntries(c) }));
    else {
      setError("В файле нет списка заклинаний");
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: chunks.length });
    const sum = zero();
    for (const [i, data] of chunks.entries()) {
      try {
        const res = await fetch("/api/spells/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!res.ok) throw new Error(await apiError(res));
        const r = (await res.json()) as { created: number; updated: number; rejected: number };
        sum.created += r.created;
        sum.updated += r.updated;
        sum.rejected += r.rejected;
      } catch (e) {
        setError(`Часть ${i + 1}: ${e instanceof Error ? e.message : "ошибка"}`);
        sum.failed++;
      }
      setTotals({ ...sum });
      setProgress({ done: i + 1, total: chunks.length });
    }
    setRunning(false);
    onDone();
    if (!sum.failed) toast.success(`Готово: новых ${sum.created}, обновлено ${sum.updated}`);
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <FileUp className="size-4 text-accent" /> Загрузить файл
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && !running) void upload(file);
          }}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm transition-colors disabled:opacity-50",
            dragging ? "border-accent bg-accent-soft" : "border-line hover:border-muted",
          )}
        >
          <FileUp className="size-6 text-faint" />
          <span className="font-medium">Файл из скрипта или JSON со списком заклинаний</span>
          <span className="text-xs text-muted">Большие файлы отправляются частями</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        {progress && <Progress done={progress.done} total={progress.total} />}
        {totals && <TotalsLine totals={totals} />}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Panel>
  );
}
