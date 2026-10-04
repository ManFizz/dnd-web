"use client";

import { ChevronDown, ChevronRight, Pencil, Plus, Swords } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { REST_LABELS } from "@/lib/rules/constants";
import { isDocEmpty } from "@/lib/rules/richtext";
import type { Feature } from "@/lib/rules/schema";
import { RichView } from "@/components/rich/view";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/input";
import { Badge, Empty, Pips } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useOpenDialog } from "./dialogs-context";
import { effectSummary } from "./effects";
import { makeEvent, useChange, useComputed } from "./store";

export function UsesControl({ feature }: { feature: Feature }) {
  const sheet = useComputed();
  const change = useChange();
  if (!feature.uses) return null;
  const max = sheet.featureUses[feature.id]?.value ?? null;
  const used = feature.uses.used;
  const setUsed = (next: number) =>
    change(
      (d) => {
        const f = d.features.find((x) => x.id === feature.id);
        if (f?.uses) f.uses.used = Math.max(0, next);
      },
      makeEvent("feature", `${feature.name}: использовано ${next}${max !== null ? ` из ${max}` : ""}`),
    );
  const reset = REST_LABELS[feature.uses.reset];
  if (max !== null && max <= 12) {
    return (
      <Tip content={`Восстановление: ${reset.toLowerCase()}`}>
        <div>
          <Pips total={max} available={Math.max(0, max - used)} onChange={(avail) => setUsed(max - avail)} label={feature.name} />
        </div>
      </Tip>
    );
  }
  return (
    <div className="flex items-center gap-1 text-sm tabular-nums">
      <Button size="icon-sm" variant="outline" onClick={() => setUsed(used + 1)} disabled={max !== null && used >= max} aria-label="Использовать">
        −
      </Button>
      <span title={`Восстановление: ${reset.toLowerCase()}`}>
        {max !== null ? `${Math.max(0, max - used)}/${max}` : `исп. ${used}`}
      </span>
      <Button size="icon-sm" variant="outline" onClick={() => setUsed(used - 1)} disabled={used <= 0} aria-label="Вернуть">
        +
      </Button>
    </div>
  );
}

export function FeatureCard({ feature, defaultOpen = false }: { feature: Feature; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const openDialog = useOpenDialog();
  const change = useChange();
  const hasText = !isDocEmpty(feature.description);
  return (
    <div className={cn("rounded-xl border border-line bg-panel", !feature.active && "opacity-60")}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 text-faint hover:text-text" aria-label={open ? "Свернуть" : "Развернуть"}>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setOpen(!open)} className="text-left font-semibold hover:text-accent">
            {feature.name || "Без названия"}
          </button>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {feature.source && <span>{feature.source}</span>}
            {feature.level > 0 && <Badge>{feature.level} ур.</Badge>}
            {feature.origin && <span>· от: {feature.origin}</span>}
            {feature.tags.map((t) => (
              <Badge key={t} tone="info">
                {t}
              </Badge>
            ))}
            {feature.attacks.length > 0 && (
              <Badge tone="danger">
                <Swords className="size-3" /> {feature.attacks.length}
              </Badge>
            )}
          </div>
          {feature.effects.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {feature.effects.map((e) => (
                <span key={e.id} className={cn("rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent", !e.enabled && "line-through opacity-50")}>
                  {effectSummary(e)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <UsesControl feature={feature} />
          <Tip content={feature.active ? "Действует" : "Отключено"}>
            <div>
              <Switch
                checked={feature.active}
                onCheckedChange={(active) =>
                  change(
                    (d) => {
                      const f = d.features.find((x) => x.id === feature.id);
                      if (f) f.active = active;
                    },
                    makeEvent("feature", `«${feature.name}» ${active ? "включено" : "отключено"}`),
                  )
                }
              />
            </div>
          </Tip>
          <Button size="icon-sm" variant="ghost" onClick={() => openDialog({ kind: "feature", feature })} aria-label="Изменить">
            <Pencil />
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <RichView doc={feature.description} label={feature.name} empty={<p className="text-sm text-faint">Описания нет.</p>} />
          {!hasText && feature.effects.length === 0 && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => openDialog({ kind: "feature", feature })}>
              <Pencil /> Заполнить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FeatureList({
  features,
  preset,
  addLabel,
  emptyTitle,
  emptyText,
  groupByLevel,
}: {
  features: Feature[];
  preset: Partial<Feature>;
  addLabel: string;
  emptyTitle: string;
  emptyText?: string;
  groupByLevel?: boolean;
}) {
  const openDialog = useOpenDialog();
  const sorted = groupByLevel ? [...features].sort((a, b) => a.level - b.level) : features;
  return (
    <div className="flex flex-col gap-2">
      {sorted.length === 0 ? (
        <Empty title={emptyTitle}>{emptyText}</Empty>
      ) : (
        sorted.map((f) => <FeatureCard key={f.id} feature={f} />)
      )}
      <div>
        <Button size="sm" variant="outline" onClick={() => openDialog({ kind: "feature", preset })}>
          <Plus /> {addLabel}
        </Button>
      </div>
    </div>
  );
}
