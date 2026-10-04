"use client";

import { Dices, X } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import type { Stat } from "@/lib/rules/compute";
import { formatValue, rollValue, type DiceTerm, type FValue, type RollResult } from "@/lib/rules/formula";
import { newId } from "@/lib/rules/ids";
import { useSheet, type RollEntry } from "./store";

export type RollMode = "normal" | "adv" | "dis";

/** Mode from modifier keys: Shift = advantage, Alt/Ctrl = disadvantage. */
export function modeFromEvent(e?: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): RollMode | null {
  if (!e) return null;
  if (e.shiftKey) return "adv";
  if (e.altKey || e.ctrlKey || e.metaKey) return "dis";
  return null;
}

/** Natural mode of a stat: advantage and disadvantage cancel out. */
export function statMode(stat: Pick<Stat, "adv" | "dis">): RollMode {
  if (stat.adv.length && !stat.dis.length) return "adv";
  if (stat.dis.length && !stat.adv.length) return "dis";
  return "normal";
}

function d20(mode: RollMode): DiceTerm {
  if (mode === "normal") return { count: 1, sides: 20, sign: 1 };
  return { count: 2, sides: 20, sign: 1, keep: { mode: mode === "adv" ? "h" : "l", n: 1 } };
}

function describe(result: RollResult): string {
  const dice = result.dice
    .map((d) => {
      const rolls = d.rolls.map((r, i) => (d.kept[i] ? String(r) : `~~${r}~~`)).join(", ");
      return `${d.term.sign < 0 ? "−" : ""}${d.term.count}к${d.term.sides}[${rolls}]`;
    })
    .join(" + ");
  const constant = result.constant ? ` ${result.constant < 0 ? "−" : "+"} ${Math.abs(result.constant)}` : "";
  return `${dice}${constant}`;
}

function RollToast({ entry, onClose }: { entry: RollEntry; onClose: () => void }) {
  const crit = entry.natural === 20;
  const fumble = entry.natural === 1;
  return (
    <div className="relative flex w-[min(360px,calc(100vw-32px))] items-center gap-3 rounded-xl border border-line bg-panel p-3 pr-9 text-text shadow-[var(--shadow)]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        title="Закрыть"
        className="absolute top-1.5 right-1.5 rounded-md p-1 text-faint transition-colors hover:bg-panel-2 hover:text-text"
      >
        <X className="size-4" />
      </button>
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-lg font-display text-2xl font-bold tabular-nums",
          crit ? "bg-good-soft text-good" : fumble ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent",
        )}
      >
        {entry.result.total}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {entry.label}
          {entry.mode !== "normal" && (
            <span className={cn("ml-1.5 text-xs font-medium", entry.mode === "adv" ? "text-good" : "text-danger")}>
              {entry.mode === "adv" ? "преимущество" : "помеха"}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted">
          <RollDetail result={entry.result} />
        </div>
        {(crit || fumble) && <div className={cn("text-xs font-semibold", crit ? "text-good" : "text-danger")}>{crit ? "Natural 20!" : "Natural 1"}</div>}
        {entry.detail && <div className="truncate text-xs text-faint">{entry.detail}</div>}
      </div>
    </div>
  );
}

export function RollDetail({ result }: { result: RollResult }) {
  const text = describe(result);
  // Dropped dice (advantage/disadvantage) are struck through.
  const parts = text.split(/~~(\d+)~~/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <s key={i} className="opacity-60">
            {p}
          </s>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export type RollRequest = {
  label: string;
  value: FValue;
  /** Adds a d20 with the given mode (checks, saves, attacks). */
  d20?: RollMode;
  detail?: string;
};

export function useRoll() {
  const pushRoll = useSheet((s) => s.pushRoll);
  return useCallback(
    (req: RollRequest): RollEntry => {
      const value: FValue = req.d20 ? { n: req.value.n, dice: [d20(req.d20), ...req.value.dice] } : req.value;
      const result = rollValue(value);
      let natural: number | undefined;
      if (req.d20) {
        const die = result.dice.find((d) => d.term.sides === 20);
        const idx = die?.kept.findIndex(Boolean) ?? -1;
        if (die && idx >= 0) natural = die.rolls[idx];
      }
      const entry: RollEntry = { id: newId("r"), label: req.label, detail: req.detail, result, mode: req.d20 ?? "normal", natural, at: Date.now() };
      pushRoll(entry);
      toast.custom((id) => <RollToast entry={entry} onClose={() => toast.dismiss(id)} />, { duration: 6000 });
      return entry;
    },
    [pushRoll],
  );
}

/** Roll a d20 check for a computed stat (mode from the stat unless forced). */
export function useRollStat() {
  const roll = useRoll();
  return useCallback(
    (label: string, stat: Stat, forced?: RollMode | null) => {
      const mode = forced ?? statMode(stat);
      const notes = [...stat.notes.map((n) => n.text)].filter(Boolean).join("; ");
      return roll({ label, value: { n: stat.value, dice: stat.dice }, d20: mode, detail: notes || undefined });
    },
    [roll],
  );
}

export function DiceButton({
  onRoll,
  title = "Бросить (Shift — с преимуществом, Alt — с помехой)",
  className,
}: {
  onRoll: (mode: RollMode | null) => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label="Бросить"
      onClick={(e) => {
        e.stopPropagation();
        onRoll(modeFromEvent(e));
      }}
      className={cn("inline-flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent-soft hover:text-accent", className)}
    >
      <Dices className="size-3.5" />
    </button>
  );
}

export { formatValue };
