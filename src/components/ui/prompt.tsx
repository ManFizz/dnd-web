"use client";

import { createContext, use, useCallback, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import { Field, Input, parseNumber } from "./input";
import { Modal } from "./overlay";

// Promise based dialogs: confirm, ask for a reason, ask for an amount.

type ConfirmOptions = { title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean };
type TextOptions = {
  title: string;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  confirmLabel?: string;
  /** Show recently used reasons as quick picks. */
  reasonSuggestions?: boolean;
};
type AmountOptions = {
  title: string;
  description?: React.ReactNode;
  /** Initial sign: gain (+) or spend (−). */
  direction?: "gain" | "spend";
  allowDirection?: boolean;
  defaultAmount?: number;
  /** Reason is required for gains (and for spends when requireSpendReason). */
  requireReason?: boolean;
  requireSpendReason?: boolean;
  unit?: string;
  integer?: boolean;
  /** Only the number: no reason field (the caller writes the journal itself). */
  noReason?: boolean;
  /** Text of the confirm button instead of Добавить/Списать. */
  confirmLabel?: string;
};
export type AmountResult = { delta: number; reason: string };

type Request =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "text"; opts: TextOptions; resolve: (v: string | null) => void }
  | { kind: "amount"; opts: AmountOptions; resolve: (v: AmountResult | null) => void };

type Ask = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  text: (opts: TextOptions) => Promise<string | null>;
  amount: (opts: AmountOptions) => Promise<AmountResult | null>;
};

const AskContext = createContext<Ask | null>(null);

export function useAsk(): Ask {
  const ctx = use(AskContext);
  if (!ctx) throw new Error("useAsk outside PromptProvider");
  return ctx;
}

const RECENT_KEY = "recent-reasons";

function recentReasons(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberReason(reason: string) {
  const r = reason.trim();
  if (!r) return;
  try {
    const list = [r, ...recentReasons().filter((x) => x !== r)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage may be unavailable (private mode); suggestions are optional.
  }
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const queue = useRef<Request[]>([]);

  const push = useCallback((r: Request) => {
    setRequest((cur) => {
      if (cur) {
        queue.current.push(r);
        return cur;
      }
      return r;
    });
  }, []);

  const finish = useCallback(() => {
    setRequest(queue.current.shift() ?? null);
  }, []);

  const ask = useMemo<Ask>(
    () => ({
      confirm: (opts) => new Promise((resolve) => push({ kind: "confirm", opts, resolve })),
      text: (opts) => new Promise((resolve) => push({ kind: "text", opts, resolve })),
      amount: (opts) => new Promise((resolve) => push({ kind: "amount", opts, resolve })),
    }),
    [push],
  );

  return (
    <AskContext value={ask}>
      {children}
      {request?.kind === "confirm" && (
        <ConfirmDialog
          opts={request.opts}
          onDone={(v) => {
            request.resolve(v);
            finish();
          }}
        />
      )}
      {request?.kind === "text" && (
        <TextDialog
          opts={request.opts}
          onDone={(v) => {
            request.resolve(v);
            finish();
          }}
        />
      )}
      {request?.kind === "amount" && (
        <AmountDialog
          opts={request.opts}
          onDone={(v) => {
            request.resolve(v);
            finish();
          }}
        />
      )}
    </AskContext>
  );
}

function ConfirmDialog({ opts, onDone }: { opts: ConfirmOptions; onDone: (v: boolean) => void }) {
  return (
    <Modal
      open
      size="sm"
      onOpenChange={(o) => !o && onDone(false)}
      title={opts.title}
      description={opts.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(false)}>
            Отмена
          </Button>
          <Button variant={opts.danger ? "danger" : "primary"} onClick={() => onDone(true)} autoFocus>
            {opts.confirmLabel ?? "Да"}
          </Button>
        </>
      }
    >
      <span className="sr-only">{opts.title}</span>
    </Modal>
  );
}

function ReasonChips({ onPick }: { onPick: (r: string) => void }) {
  const [list] = useState(recentReasons);
  if (!list.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick(r)}
          className="max-w-full truncate rounded-md border border-line bg-panel-2 px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-text"
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function TextDialog({ opts, onDone }: { opts: TextOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? "");
  const invalid = opts.required && !value.trim();
  const submit = () => {
    if (invalid) return;
    if (opts.reasonSuggestions) rememberReason(value);
    onDone(value.trim());
  };
  return (
    <Modal
      open
      size="sm"
      onOpenChange={(o) => !o && onDone(null)}
      title={opts.title}
      description={opts.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(null)}>
            Отмена
          </Button>
          <Button variant="primary" disabled={invalid} onClick={submit}>
            {opts.confirmLabel ?? "Готово"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={opts.label} required={opts.required}>
          <Input autoFocus value={value} placeholder={opts.placeholder} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {opts.reasonSuggestions && <ReasonChips onPick={setValue} />}
      </form>
    </Modal>
  );
}

function AmountDialog({ opts, onDone }: { opts: AmountOptions; onDone: (v: AmountResult | null) => void }) {
  const [direction, setDirection] = useState<"gain" | "spend">(opts.direction ?? "gain");
  const [amount, setAmount] = useState(opts.defaultAmount !== undefined ? String(opts.defaultAmount) : "");
  const [reason, setReason] = useState("");
  const n = parseNumber(amount);
  const value = n === null ? null : opts.integer === false ? Math.abs(n) : Math.round(Math.abs(n));
  const reasonNeeded = direction === "gain" ? opts.requireReason : opts.requireSpendReason;
  const invalid = !value || (reasonNeeded && !reason.trim());
  const submit = () => {
    if (invalid || value === null) return;
    rememberReason(reason);
    onDone({ delta: direction === "gain" ? value : -value, reason: reason.trim() });
  };
  return (
    <Modal
      open
      size="sm"
      onOpenChange={(o) => !o && onDone(null)}
      title={opts.title}
      description={opts.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(null)}>
            Отмена
          </Button>
          <Button variant="primary" disabled={invalid} onClick={submit}>
            {opts.confirmLabel ?? (direction === "gain" ? "Добавить" : "Списать")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {opts.allowDirection !== false && (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel-2 p-0.5">
            {(["gain", "spend"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={
                  "rounded-md py-1.5 text-sm font-medium " +
                  (direction === d ? (d === "gain" ? "bg-good-soft text-good" : "bg-danger-soft text-danger") : "text-muted hover:text-text")
                }
              >
                {d === "gain" ? "Получить +" : "Потратить −"}
              </button>
            ))}
          </div>
        )}
        <Field label={opts.unit ? `Количество (${opts.unit})` : "Количество"}>
          <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        {!opts.noReason && (
          <>
            <Field
              label={direction === "gain" ? "За что получено" : "На что потрачено"}
              required={reasonNeeded}
              hint={reasonNeeded ? "Попадёт в журнал изменений" : "Необязательно, попадёт в журнал"}
            >
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={direction === "gain" ? "Награда за квест, находка…" : "Покупка, плата…"} />
            </Field>
            <ReasonChips onPick={setReason} />
          </>
        )}
      </form>
    </Modal>
  );
}
