"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibrarySpell } from "@/lib/spells";

export type SpellFilters = { q?: string; level?: string; cls?: string; source?: string; mine?: boolean };

type Page = { key: string; spells: LibrarySpell[]; total: number };

function params(f: SpellFilters, limit: number, offset: number) {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.level) p.set("level", f.level);
  if (f.cls?.trim()) p.set("cls", f.cls.trim());
  if (f.source) p.set("source", f.source);
  if (f.mine) p.set("mine", "1");
  return p;
}

async function fetchPage(f: SpellFilters, limit: number, offset: number, signal?: AbortSignal) {
  const res = await fetch(`/api/spells?${params(f, limit, offset)}`, { signal });
  if (!res.ok) throw new Error(res.status === 401 ? "Нужно войти" : `Ошибка ${res.status}`);
  return (await res.json()) as { spells: LibrarySpell[]; total: number };
}

function fromKey(key: string): SpellFilters {
  const [q, level, cls, source, mine] = JSON.parse(key) as [string, string, string, string, boolean];
  return { q, level, cls, source, mine };
}

/** Debounced library search with "load more" paging. Bump `nonce` to refetch. */
export function useSpellSearch(filters: SpellFilters, pageSize = 50, nonce = 0) {
  const key = JSON.stringify([filters.q?.trim() ?? "", filters.level ?? "", filters.cls?.trim() ?? "", filters.source ?? "", !!filters.mine, nonce]);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage(fromKey(key), pageSize, 0, ctrl.signal);
        setPage({ key, ...data });
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, pageSize]);

  const loadMore = useCallback(async () => {
    if (!page || page.spells.length >= page.total) return;
    const forKey = page.key;
    setLoading(true);
    try {
      const data = await fetchPage(fromKey(forKey), pageSize, page.spells.length);
      if (keyRef.current !== forKey) return;
      setPage((p) => (p && p.key === forKey ? { ...p, spells: [...p.spells, ...data.spells.filter((s) => !p.spells.some((x) => x.id === s.id))], total: data.total } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  return {
    spells: page?.spells ?? [],
    total: page?.total ?? 0,
    loaded: page !== null,
    loading,
    error,
    loadMore,
    hasMore: page ? page.spells.length < page.total : false,
  };
}
