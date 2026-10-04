"use client";

import { Pencil, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActiveEffect } from "@/lib/rules/compute";
import { targetLabel } from "@/lib/rules/targets";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/input";
import { Empty, Panel } from "@/components/ui/misc";
import { useAsk } from "@/components/ui/prompt";
import { useOpenDialog } from "../dialogs-context";
import { effectSummary } from "../effects";
import { makeEvent, useChange, useComputed, useDoc } from "../store";

function overrideTitle(key: string): string {
  const label = targetLabel(key);
  return label === key && key.startsWith("attack.") ? "Атака" : label;
}

export function BonusesTab() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const open = useOpenDialog();
  const ask = useAsk();
  const overrides = Object.entries(doc.overrides);
  const bySource = new Map<string, ActiveEffect[]>();
  for (const e of sheet.calc.effects) bySource.set(e.sourceName, [...(bySource.get(e.sourceName) ?? []), e]);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Бонусы"
        actions={
          <Button size="sm" variant="primary" onClick={() => open({ kind: "bonus" })}>
            <Plus /> Бонус
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Ручные прибавки к любым показателям, каждая со своей подписью «за что». Они видны в разборе каждого числа и легко отключаются.
        </p>
        {doc.bonuses.length === 0 ? (
          <Empty title="Бонусов нет">Например: «+1 к спасброскам — благословение храма», «Сопротивление холоду — дар ледяного духа».</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {doc.bonuses.map((b) => (
              <div key={b.id} className={cn("flex items-center gap-3 px-3 py-2", !b.enabled && "opacity-55")}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{effectSummary(b)}</div>
                  <div className="truncate text-xs text-muted">{b.label || "Без подписи"}</div>
                </div>
                <Switch
                  checked={b.enabled}
                  onCheckedChange={(enabled) =>
                    change(
                      (d) => {
                        const x = d.bonuses.find((y) => y.id === b.id);
                        if (x) x.enabled = enabled;
                      },
                      makeEvent("bonus", `${enabled ? "Включён" : "Отключён"} бонус: ${effectSummary(b)}`, b.label),
                    )
                  }
                />
                <Button size="icon-sm" variant="ghost" onClick={() => open({ kind: "bonus", effect: b })} aria-label="Изменить">
                  <Pencil />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Ручные значения">
        {overrides.length === 0 ? (
          <p className="text-sm text-muted">Нет. Любое число можно задать вручную через его разбор (кнопка «Вручную») — с обязательной причиной.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {overrides.map(([key, ov]) => (
              <div key={key} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {overrideTitle(key)}: <span className="text-accent">{ov.value}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {ov.reason}
                    {ov.at && ` · ${new Date(ov.at).toLocaleDateString("ru")}`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await ask.confirm({ title: "Вернуть автоматический расчёт?", description: `${overrideTitle(key)} снова будет считаться само.`, confirmLabel: "Вернуть" });
                    if (!ok) return;
                    change(
                      (d) => {
                        delete d.overrides[key];
                      },
                      makeEvent("override", `${overrideTitle(key)}: снова считается автоматически (было вручную ${ov.value})`),
                    );
                  }}
                >
                  <RotateCcw /> Авто
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Все действующие эффекты">
        <p className="mb-3 text-sm text-muted">Сводка: что и откуда сейчас меняет показатели персонажа.</p>
        {bySource.size === 0 ? (
          <p className="text-sm text-faint">Эффектов нет.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {[...bySource.entries()].map(([source, effects]) => (
              <div key={source} className="rounded-lg border border-line p-3">
                <div className="mb-1.5 text-sm font-semibold">{source}</div>
                <div className="flex flex-wrap gap-1">
                  {effects.map((e) => (
                    <span key={`${e.sourceId}-${e.id}`} className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs text-accent" title={e.label}>
                      {effectSummary(e)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
