"use client";

import { History, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EVENT_KIND_LABELS, type CharacterEventRow } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, Empty } from "@/components/ui/misc";
import { useSheet } from "../store";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Marks every case-insensitive occurrence of the query. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-accent">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function EventLine({ kind, summary, reason, at, pending, query }: { kind: string; summary: string; reason: string; at: string; pending?: boolean; query: string }) {
  const date = new Date(at);
  return (
    <div className="flex gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <div className="w-20 shrink-0 text-xs text-faint tabular-nums">
        <div>{date.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" })}</div>
        <div>{date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{EVENT_KIND_LABELS[kind] ?? kind}</Badge>
          {pending && <Badge tone="accent">не сохранено</Badge>}
          <span className="text-sm">
            <Highlight text={summary} query={query} />
          </span>
        </div>
        {reason && (
          <div className="mt-0.5 text-sm text-accent">
            За что: <Highlight text={reason} query={query} />
          </div>
        )}
      </div>
    </div>
  );
}

async function fetchEvents(id: string, filter: { kind: string; q: string }, after: string | null) {
  const params = new URLSearchParams({ limit: "50" });
  if (filter.kind) params.set("kind", filter.kind);
  if (filter.q) params.set("q", filter.q);
  if (after) params.set("cursor", after);
  const res = await fetch(`/api/characters/${id}/events?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
  return (await res.json()) as { events: CharacterEventRow[]; nextCursor: string | null };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type Page = { key: string; events: CharacterEventRow[]; cursor: string | null };

export function JournalTab() {
  const id = useSheet((s) => s.id);
  const pending = useSheet((s) => s.pending);
  const savedAt = useSheet((s) => s.savedAt);
  const [kind, setKind] = useState("");
  const [input, setInput] = useState("");
  const query = useDebounced(input.trim(), 300);
  const [page, setPage] = useState<Page | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Refetch when the filter changes and after each save; the old list stays visible meanwhile.
  const key = JSON.stringify([kind, query, savedAt]);

  useEffect(() => {
    let cancelled = false;
    fetchEvents(id, { kind, q: query }, null)
      .then((data) => {
        if (cancelled) return;
        setPage({ key, events: data.events, cursor: data.nextCursor });
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Не удалось загрузить журнал"));
    return () => {
      cancelled = true;
    };
  }, [id, kind, query, key]);

  const loading = page?.key !== key || input.trim() !== query;
  const events = page?.events ?? [];
  const cursor = page?.cursor ?? null;

  const loadMore = async () => {
    if (!page?.cursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchEvents(id, { kind, q: query }, page.cursor);
      setPage((prev) =>
        prev && prev.key === key ? { ...prev, events: [...prev.events, ...data.events.filter((e) => !prev.events.some((p) => p.id === e.id))], cursor: data.nextCursor } : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить журнал");
    } finally {
      setLoadingMore(false);
    }
  };

  const needle = query.toLowerCase();
  const shownPending = pending.filter(
    (p) => (!kind || p.kind === kind) && (!needle || p.summary.toLowerCase().includes(needle) || (p.reason ?? "").toLowerCase().includes(needle)),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Поиск: «рубин», «урон», «за квест»…"
            aria-label="Поиск по журналу"
            className="pr-9 pl-9"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              className="absolute top-2 right-2 rounded-md p-0.5 text-faint hover:text-text"
              aria-label="Очистить поиск"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Тип записей"
          options={[{ value: "", label: "Все записи" }, ...Object.entries(EVENT_KIND_LABELS).map(([value, label]) => ({ value, label }))]}
          className="w-44"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="relative rounded-xl border border-line bg-panel">
        {[...shownPending].reverse().map((p, i) => (
          <EventLine key={`p${i}`} kind={p.kind} summary={p.summary} reason={p.reason ?? ""} at={p.at ?? new Date().toISOString()} pending query={query} />
        ))}
        {events.map((e) => (
          <EventLine key={e.id} kind={e.kind} summary={e.summary} reason={e.reason} at={e.createdAt} query={query} />
        ))}
        {!events.length && !shownPending.length && !loading && (
          <div className="p-4">
            <Empty icon={<History />} title={query || kind ? "Ничего не нашлось" : "Журнал пуст"}>
              {query ? "Поиск идёт по тексту записи и по подписи «за что»." : undefined}
            </Empty>
          </div>
        )}
        {loading && (
          <div className={events.length || shownPending.length ? "absolute top-2 right-2" : "flex justify-center p-4"}>
            <Loader2 className="size-5 animate-spin text-faint" />
          </div>
        )}
      </div>
      {cursor && !loading && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="animate-spin" />} Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
