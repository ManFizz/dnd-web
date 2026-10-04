"use client";

import { Hash, Minus, Pencil, Pin, Plus } from "lucide-react";
import { REST_LABELS } from "@/lib/rules/constants";
import type { Counter } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Empty, Panel } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { cn } from "@/lib/cn";
import { GrantBadge, useGrantView } from "../grant-badge";
import { useOpenDialog } from "../dialogs-context";
import { UsesControl } from "../feature-list";
import { ItemCharges } from "./inventory";
import { makeEvent, useChange, useComputed, useDoc, useSheetApi } from "../store";

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ru") : n.toLocaleString("ru", { maximumFractionDigits: 2 }));

export function CounterCard({ counter }: { counter: Counter }) {
  const sheet = useComputed();
  const doc = useDoc();
  const change = useChange();
  const api = useSheetApi();
  const ask = useAsk();
  const open = useOpenDialog();
  const max = sheet.counters[counter.id]?.value ?? null;
  const maxError = sheet.counters[counter.id]?.error;
  const view = useGrantView(counter.grant);

  const apply = (delta: number, reason: string) => {
    const cur = api.getState().doc.counters.find((c) => c.id === counter.id);
    if (!cur) return;
    let next = cur.value + delta;
    if (max !== null) next = Math.min(max, next);
    next = Math.max(cur.min, next);
    if (next === cur.value) return;
    change(
      (d) => {
        const c = d.counters.find((x) => x.id === counter.id);
        if (c) c.value = next;
      },
      makeEvent("counter", `${counter.name}: ${fmt(cur.value)} → ${fmt(next)} (${next > cur.value ? "+" : ""}${fmt(next - cur.value)})`, reason),
    );
  };

  const gain = async () => {
    if (!doc.settings.requireReasons) return apply(counter.step || 1, "");
    const r = await ask.amount({ title: counter.name, direction: "gain", allowDirection: false, defaultAmount: counter.step || 1, requireReason: true, integer: false });
    if (r) apply(r.delta, r.reason);
  };
  const custom = async () => {
    const r = await ask.amount({
      title: counter.name,
      description: `Сейчас: ${fmt(counter.value)}${max !== null ? ` из ${fmt(max)}` : ""}`,
      requireReason: doc.settings.requireReasons,
      integer: false,
    });
    if (r) apply(r.delta, r.reason);
  };

  const pct = max ? Math.max(0, Math.min(1, counter.value / max)) : null;
  if (view.hidden) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{counter.name || "Счётчик"}</span>
            {counter.pinned && <Pin className="size-3 shrink-0 text-faint" />}
            <GrantBadge grant={counter.grant} />
          </div>
          <div className="text-xs text-faint">
            {counter.reset !== "none" ? `${REST_LABELS[counter.reset]} → ${counter.resetTo === "max" ? "максимум" : "минимум"}` : "Вручную"}
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => open({ kind: "counter", counter })} aria-label="Настроить">
          <Pencil />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Tip content={`Списать ${fmt(counter.step || 1)}`}>
          <Button size="icon" variant="outline" onClick={() => apply(-(counter.step || 1), "")} disabled={counter.value <= counter.min} aria-label="Уменьшить">
            <Minus />
          </Button>
        </Tip>
        <Tip
          content={
            <>
              <div>Изменить на любое число: прибавить, списать или задать, с подписью «за что»</div>
              {max !== null && counter.max.trim() && !/^\d+$/.test(counter.max.trim()) && (
                <div className="text-muted">
                  Максимум {fmt(max)} считается по формуле {counter.max}
                </div>
              )}
            </>
          }
        >
          <button
            type="button"
            onClick={custom}
            aria-label={`${counter.name || "Счётчик"}: ${fmt(counter.value)}${max !== null ? ` из ${fmt(max)}` : ""}`}
            className="flex items-baseline gap-1 font-display tabular-nums hover:text-accent"
          >
            <span className="text-2xl font-bold">{fmt(counter.value)}</span>
            {max !== null && <span className="text-sm text-muted">/ {fmt(max)}</span>}
          </button>
        </Tip>
        <Tip content={doc.settings.requireReasons ? "Получить (спросит, за что)" : `Добавить ${fmt(counter.step || 1)}`}>
          <Button size="icon" variant="outline" onClick={gain} disabled={max !== null && counter.value >= max} aria-label="Увеличить">
            <Plus />
          </Button>
        </Tip>
      </div>
      {pct !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-panel-3">
          <div className={cn("h-full rounded-full bg-accent")} style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      {maxError && <div className="text-xs text-danger">Максимум: {maxError}</div>}
      {counter.description && <div className="text-xs text-muted">{counter.description}</div>}
    </div>
  );
}

export function CountersTab() {
  const doc = useDoc();
  const open = useOpenDialog();
  const groups = new Map<string, Counter[]>();
  for (const c of doc.counters) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const keys = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "ru")));
  const usesFeatures = doc.features.filter((f) => f.uses);
  const chargedItems = doc.items.filter((i) => i.charges);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Сухпайки, рубины, стрелы, долги, репутация — всё, что нужно считать. Пополнение спросит, за что получено.</p>
        <Button variant="primary" onClick={() => open({ kind: "counter" })}>
          <Plus /> Счётчик
        </Button>
      </div>
      {doc.counters.length === 0 ? (
        <Empty icon={<Hash />} title="Счётчиков пока нет">
          Например: «Рубины» без максимума или «Сухпайки» с восстановлением вручную. Счётчики можно использовать в формулах: @counter.рубины.
        </Empty>
      ) : (
        keys.map((k) => (
          <div key={k || "_"} className="flex flex-col gap-2">
            {k && <h3 className="font-display text-base font-bold">{k}</h3>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groups.get(k)!.map((c) => (
                <CounterCard key={c.id} counter={c} />
              ))}
            </div>
          </div>
        ))
      )}
      {(usesFeatures.length > 0 || chargedItems.length > 0) && (
        <Panel title="Использования способностей и заряды предметов">
          <div className="grid gap-2 sm:grid-cols-2">
            {usesFeatures.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <button type="button" className="min-w-0 truncate text-left text-sm hover:text-accent" onClick={() => open({ kind: "feature", feature: f })}>
                  {f.name}
                </button>
                <UsesControl feature={f} />
              </div>
            ))}
            {chargedItems.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <button type="button" className="min-w-0 truncate text-left text-sm hover:text-accent" onClick={() => open({ kind: "item", item: i })}>
                  {i.name}
                </button>
                <ItemCharges item={i} />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
