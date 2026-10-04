"use client";

import { History, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EVENT_KIND_LABELS, type CharacterEventRow } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge, Empty } from "@/components/ui/misc";
import { useSheet } from "../store";

function EventLine({ kind, summary, reason, at, pending, user }: { kind: string; summary: string; reason: string; at: string; pending?: boolean; user?: string | null }) {
  const date = new Date(at);
  return (
    <div className="flex gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <div className="w-24 shrink-0 text-xs text-faint tabular-nums">
        <div>{date.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" })}</div>
        <div>{date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{EVENT_KIND_LABELS[kind] ?? kind}</Badge>
          {pending && <Badge tone="accent">не сохранено</Badge>}
          <span className="text-sm">{summary}</span>
        </div>
        {reason && <div className="mt-0.5 text-sm text-accent">За что: {reason}</div>}
        {user && <div className="text-xs text-faint">{user}</div>}
      </div>
    </div>
  );
}

async function fetchEvents(id: string, kind: string, after: string | null) {
  const params = new URLSearchParams({ limit: "50" });
  if (kind) params.set("kind", kind);
  if (after) params.set("cursor", after);
  const res = await fetch(`/api/characters/${id}/events?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
  return (await res.json()) as { events: CharacterEventRow[]; nextCursor: string | null };
}

export function JournalTab() {
  const id = useSheet((s) => s.id);
  const pending = useSheet((s) => s.pending);
  const savedAt = useSheet((s) => s.savedAt);
  const [kind, setKind] = useState("");
  const [events, setEvents] = useState<CharacterEventRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial page and refresh after each save; failures keep the old list.
  useEffect(() => {
    let cancelled = false;
    fetchEvents(id, kind, null)
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events);
        setCursor(data.nextCursor);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Не удалось загрузить журнал"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, kind, savedAt]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const data = await fetchEvents(id, kind, cursor);
      setEvents((prev) => [...prev, ...data.events.filter((e) => !prev.some((p) => p.id === e.id))]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить журнал");
    } finally {
      setLoading(false);
    }
  };

  const shownPending = pending.filter((p) => !kind || p.kind === kind);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Все изменения персонажа с подписями «за что». Записи пишутся автоматически.</p>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[{ value: "", label: "Все записи" }, ...Object.entries(EVENT_KIND_LABELS).map(([value, label]) => ({ value, label }))]}
          className="w-48"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="rounded-xl border border-line bg-panel">
        {[...shownPending].reverse().map((p, i) => (
          <EventLine key={`p${i}`} kind={p.kind} summary={p.summary} reason={p.reason ?? ""} at={p.at ?? new Date().toISOString()} pending />
        ))}
        {events.map((e) => (
          <EventLine key={e.id} kind={e.kind} summary={e.summary} reason={e.reason} at={e.createdAt} user={null} />
        ))}
        {!events.length && !shownPending.length && !loading && (
          <div className="p-4">
            <Empty icon={<History />} title="Журнал пуст" />
          </div>
        )}
        {loading && (
          <div className="flex justify-center p-4">
            <Loader2 className="size-5 animate-spin text-faint" />
          </div>
        )}
      </div>
      {cursor && !loading && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loading}>
            Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
