"use client";

import { useCallback, useEffect, useState } from "react";
import { BESTIARY_IMPORT, DndSuImportBlocks } from "@/components/spells/spell-import";

export function BestiaryImport() {
  const [total, setTotal] = useState<number | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/bestiary?limit=1", { cache: "no-store" });
    if (res.ok) setTotal(((await res.json()) as { total: number }).total);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/bestiary?limit=1", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ total: number }>) : null))
      .then((d) => alive && d && setTotal(d.total))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Загрузка бестиария</h1>
        <p className="mt-1 text-muted">
          Общий бестиарий для всех кампаний сайта: из него берутся монстры для боя и существа для мутаций.{" "}
          {total !== null && (total ? `Сейчас в нём ${total} существ.` : "Сейчас он пуст.")} Повторная загрузка обновит существ, а не продублирует их.
        </p>
      </div>
      <DndSuImportBlocks kind={BESTIARY_IMPORT} onDone={() => void load()} />
    </div>
  );
}
