"use client";

import { Dices, Hand, PenLine, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatStat, type Part, type Stat } from "@/lib/rules/compute";
import { formatValue } from "@/lib/rules/formula";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Popover } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useRollStat, type RollMode } from "./dice";
import { useOpenDialog } from "./dialogs-context";
import { makeEvent, useChange, useDoc } from "./store";

const KIND_LABEL: Partial<Record<Part["kind"], string>> = {
  set: "замена",
  min: "не меньше",
  max: "не больше",
  override: "вручную",
};

function partText(p: Part, signed: boolean): string {
  if (p.kind === "set" || p.kind === "min" || p.kind === "max" || p.kind === "override") return String(p.value);
  if (p.kind === "base") return signed ? formatValue({ n: p.value, dice: [] }, { signed: true }) : String(p.value);
  const main = p.value !== 0 || !p.dice ? formatValue({ n: p.value, dice: [] }, { signed: true }) : "";
  return [main, p.dice].filter(Boolean).join(" ");
}

export function Breakdown({ stat, signed = true }: { stat: Stat; signed?: boolean }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {stat.parts.map((p, i) => (
        <div key={i} className={cn("flex items-baseline justify-between gap-3", p.kind === "override" && "text-accent")}>
          <div className="min-w-0">
            <div className="truncate">{p.label || p.source}</div>
            {p.label && p.source && p.source !== p.label && <div className="truncate text-xs text-faint">{p.source}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 tabular-nums">
            {KIND_LABEL[p.kind] && <Badge tone={p.kind === "override" ? "accent" : "neutral"}>{KIND_LABEL[p.kind]}</Badge>}
            <span className="font-semibold">{partText(p, signed)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export type StatDetailsProps = {
  title: string;
  stat: Stat;
  /** Label for d20 rolls; omit for values that are not rolled (AC, speed). */
  rollLabel?: string;
  /** Effect target for the "add bonus" button (defaults to stat.key). */
  bonusTarget?: string | null;
  overridable?: boolean;
  signed?: boolean;
  /** Extra controls rendered under the breakdown. */
  children?: React.ReactNode;
  onAction?: () => void;
};

export function StatDetails({ title, stat, rollLabel, bonusTarget, overridable = true, signed = true, children, onAction }: StatDetailsProps) {
  const rollStat = useRollStat();
  const open = useOpenDialog();
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const override = doc.overrides[stat.key];
  const value = signed ? formatStat(stat) : String(stat.value);
  const roll = (mode: RollMode | null) => {
    if (rollLabel) rollStat(rollLabel, stat, mode);
  };
  const target = bonusTarget === undefined ? stat.key : bonusTarget;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="font-display text-base leading-tight font-bold">{title}</div>
        <div className={cn("font-display text-2xl leading-none font-bold tabular-nums", stat.overridden && "text-accent")}>{value}</div>
      </div>
      {rollLabel && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant="subtle" onClick={() => roll("normal")}>
            <Dices /> к20
          </Button>
          <Button size="sm" variant="outline" className="text-good" onClick={() => roll("adv")}>
            Преим.
          </Button>
          <Button size="sm" variant="outline" className="text-danger" onClick={() => roll("dis")}>
            Помеха
          </Button>
        </div>
      )}
      {(stat.adv.length > 0 || stat.dis.length > 0) && (
        <div className="flex flex-col gap-1 rounded-lg bg-panel-2 p-2 text-xs">
          {stat.adv.map((n, i) => (
            <div key={`a${i}`}>
              <span className="font-semibold text-good">Преимущество</span> {n.text && `· ${n.text}`} <span className="text-faint">({n.source})</span>
            </div>
          ))}
          {stat.dis.map((n, i) => (
            <div key={`d${i}`}>
              <span className="font-semibold text-danger">Помеха</span> {n.text && `· ${n.text}`} <span className="text-faint">({n.source})</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Из чего складывается</div>
        <Breakdown stat={stat} signed={signed} />
      </div>
      {stat.notes.length > 0 && (
        <div className="flex flex-col gap-1 text-xs">
          {stat.notes.map((n, i) => (
            <div key={i}>
              <Hand className="mr-1 inline size-3 text-info" />
              {n.text} <span className="text-faint">({n.source})</span>
            </div>
          ))}
        </div>
      )}
      {stat.errors.length > 0 && (
        <div className="rounded-lg bg-danger-soft p-2 text-xs text-danger">
          {stat.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {children}
      <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
        {target && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onAction?.();
              open({ kind: "bonus", target });
            }}
          >
            <Plus /> Бонус
          </Button>
        )}
        {overridable &&
          (override ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                onAction?.();
                const ok = await ask.confirm({
                  title: "Вернуть автоматический расчёт?",
                  description: `Сейчас «${title}» задано вручную: ${override.value} (${override.reason}).`,
                  confirmLabel: "Вернуть",
                });
                if (!ok) return;
                change(
                  (d) => {
                    delete d.overrides[stat.key];
                  },
                  makeEvent("override", `${title}: снова считается автоматически (было вручную ${override.value})`),
                );
              }}
            >
              <RotateCcw /> Авто
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onAction?.();
                open({ kind: "override", key: stat.key, title, current: stat.value });
              }}
            >
              <PenLine /> Вручную
            </Button>
          ))}
      </div>
    </div>
  );
}

/** A clickable stat value that opens its breakdown with roll and edit actions. */
export function StatPopover({
  trigger,
  className,
  ...details
}: StatDetailsProps & { trigger: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} trigger={trigger} className={cn("w-80", className)}>
      <StatDetails {...details} onAction={() => setOpen(false)} />
    </Popover>
  );
}

/** Small marker for values that differ from the plain base: overridden, adv/dis. */
export function StatFlags({ stat }: { stat: Stat }) {
  return (
    <>
      {stat.overridden && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-accent" title="Задано вручную" />}
      {stat.adv.length > 0 && !stat.dis.length && (
        <span className="text-[10px] leading-none text-good" title="Преимущество">
          ▲
        </span>
      )}
      {stat.dis.length > 0 && !stat.adv.length && (
        <span className="text-[10px] leading-none text-danger" title="Помеха">
          ▼
        </span>
      )}
    </>
  );
}
