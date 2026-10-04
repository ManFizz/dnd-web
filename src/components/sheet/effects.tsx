"use client";

import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { newEffect } from "@/lib/rules/defaults";
import { formatValue } from "@/lib/rules/formula";
import type { Effect, EffectOp } from "@/lib/rules/schema";
import { grantSuggestions } from "@/lib/rules/suggestions";
import { OP_LABELS, opsForTarget, targetDef, targetLabel, TARGETS } from "@/lib/rules/targets";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { Popover } from "@/components/ui/overlay";
import { useMaybeComputed } from "./store";

const PROF_OPTIONS = [
  { value: "0.5", label: "Половина бонуса" },
  { value: "1", label: "Владение" },
  { value: "2", label: "Экспертиза" },
];

const WHEN_OPTIONS = [
  { value: "auto", label: "Когда надет / настроен" },
  { value: "always", label: "Всегда (лежит в сумке)" },
  { value: "equipped", label: "Только надетым" },
  { value: "attuned", label: "Только при настройке" },
];

export function TargetPicker({ value, onChange, className }: { value: string; onChange: (key: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, typeof TARGETS>();
    for (const t of TARGETS) {
      if (q && !t.label.toLowerCase().includes(q) && !t.group.toLowerCase().includes(q) && !t.key.includes(q)) continue;
      map.set(t.group, [...(map.get(t.group) ?? []), t]);
    }
    return [...map.entries()];
  }, [query]);
  const custom = query.trim();
  const customValid = /^[a-z][\w.]{1,80}$/i.test(custom) && !targetDef(custom);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
      className="w-80 p-0"
      modal
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-line bg-panel-2 px-3 text-left text-sm hover:border-line-strong",
            className,
          )}
        >
          <span className="truncate">{targetLabel(value)}</span>
          <ChevronDown className="size-4 shrink-0 text-faint" />
        </button>
      }
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-4 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Что изменяет: КД, Ловкость, сопротивление…"
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {groups.map(([group, items]) => (
          <div key={group} className="mb-1">
            <div className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">{group}</div>
            {items.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  onChange(t.key);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-2",
                  t.key === value && "text-accent",
                )}
              >
                <span>{t.label}</span>
                {t.key === value && <Check className="size-4" />}
              </button>
            ))}
          </div>
        ))}
        {customValid && (
          <button
            type="button"
            onClick={() => {
              onChange(custom);
              setOpen(false);
              setQuery("");
            }}
            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-panel-2"
          >
            Свой ключ: <code className="text-text">{custom}</code>
          </button>
        )}
        {!groups.length && !customValid && <div className="px-2 py-3 text-sm text-faint">Ничего не нашлось</div>}
      </div>
    </Popover>
  );
}

/** Live preview of a formula in the context of the current character. */
export function FormulaPreview({ formula, className }: { formula: string; className?: string }) {
  const sheet = useMaybeComputed();
  if (!sheet || !formula.trim()) return null;
  const r = sheet.calc.evaluate(formula);
  return (
    <span className={cn("text-xs tabular-nums", r.ok ? "text-faint" : "text-danger", className)}>
      {r.ok ? `= ${formatValue(r.value)}` : r.error}
    </span>
  );
}

function ValueInput({ effect, onChange }: { effect: Effect; onChange: (value: string) => void }) {
  const listId = useId();
  const def = targetDef(effect.target);
  if (def?.kind === "prof") {
    return <Select value={effect.value || "1"} onChange={(e) => onChange(e.target.value)} options={PROF_OPTIONS} />;
  }
  if (effect.op === "adv" || effect.op === "dis" || effect.op === "note") {
    return <Input value={effect.value} onChange={(e) => onChange(e.target.value)} placeholder={effect.op === "note" ? "Текст заметки" : "Когда (необязательно)"} />;
  }
  if (effect.op === "grant") {
    const suggestions = grantSuggestions(effect.target);
    return (
      <>
        <Input value={effect.value} onChange={(e) => onChange(e.target.value)} placeholder={def?.hint ?? "Что даёт"} list={suggestions.length ? listId : undefined} />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Input value={effect.value} onChange={(e) => onChange(e.target.value)} placeholder={def?.hint ?? "2, 1d4, PROF, 13 + DEX"} className="font-mono" />
      <FormulaPreview formula={effect.value} />
    </div>
  );
}

export function EffectRow({
  effect,
  onChange,
  onRemove,
  showWhen,
  requireLabel,
}: {
  effect: Effect;
  onChange: (e: Effect) => void;
  onRemove: () => void;
  showWhen?: boolean;
  requireLabel?: boolean;
}) {
  const ops = opsForTarget(effect.target);
  const setTarget = (target: string) => {
    const nextOps = opsForTarget(target);
    const op = nextOps.includes(effect.op) ? effect.op : nextOps[0];
    const value = targetDef(target)?.kind === "prof" ? "1" : targetDef(effect.target)?.kind === "prof" ? "" : effect.value;
    onChange({ ...effect, target, op, value });
  };
  return (
    <div className={cn("grid gap-2 rounded-lg border border-line bg-panel p-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)]", !effect.enabled && "opacity-60")}>
      <TargetPicker value={effect.target} onChange={setTarget} />
      <Select
        value={effect.op}
        onChange={(e) => onChange({ ...effect, op: e.target.value as EffectOp })}
        options={ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
        disabled={ops.length === 1}
      />
      <ValueInput effect={effect} onChange={(value) => onChange({ ...effect, value })} />
      <Input
        value={effect.label}
        onChange={(e) => onChange({ ...effect, label: e.target.value })}
        placeholder={requireLabel ? "За что получено (обязательно)" : "Подпись (необязательно)"}
        aria-invalid={requireLabel && !effect.label.trim() ? true : undefined}
        className="sm:col-span-2"
      />
      <div className="flex items-center justify-between gap-2">
        {showWhen ? (
          <Select
            value={effect.when}
            onChange={(e) => onChange({ ...effect, when: e.target.value as Effect["when"] })}
            options={WHEN_OPTIONS}
            className="min-w-0 flex-1"
          />
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-1">
          <Switch checked={effect.enabled} onCheckedChange={(enabled) => onChange({ ...effect, enabled })} />
          <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Удалить эффект">
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EffectsEditor({
  effects,
  onChange,
  showWhen,
  requireLabel,
  emptyText = "Нет эффектов. Эффекты меняют показатели автоматически: +1 к КД, сопротивление огню, владение навыком…",
}: {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
  showWhen?: boolean;
  requireLabel?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {effects.length === 0 && <p className="text-sm text-muted">{emptyText}</p>}
      {effects.map((e, i) => (
        <EffectRow
          key={e.id}
          effect={e}
          showWhen={showWhen}
          requireLabel={requireLabel}
          onChange={(next) => onChange(effects.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(effects.filter((_, j) => j !== i))}
        />
      ))}
      <div>
        <Button size="sm" variant="outline" onClick={() => onChange([...effects, newEffect()])}>
          <Plus /> Эффект
        </Button>
      </div>
    </div>
  );
}

/** One-line description of an effect for lists: "КД +1", "Сопротивление: Огонь". */
export function effectSummary(e: Effect): string {
  const label = targetLabel(e.target);
  switch (e.op) {
    case "add": {
      const v = e.value.trim();
      return `${label} ${/^[-−+]/.test(v) ? v : `+${v || 0}`}`;
    }
    case "set":
      if (targetDef(e.target)?.kind === "prof") return `${label}${e.value === "2" ? " (экспертиза)" : e.value === "0.5" ? " (половина)" : ""}`;
      return `${label} = ${e.value}`;
    case "min":
      return `${label} не меньше ${e.value}`;
    case "max":
      return `${label} не больше ${e.value}`;
    case "adv":
      return `Преимущество: ${label}${e.value ? ` (${e.value})` : ""}`;
    case "dis":
      return `Помеха: ${label}${e.value ? ` (${e.value})` : ""}`;
    case "grant":
      return `${label}: ${e.value}`;
    case "note":
      return `${label}: ${e.value}`;
  }
}
