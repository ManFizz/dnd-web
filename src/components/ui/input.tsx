"use client";

import { Switch as RadixSwitch } from "radix-ui";
import { cloneElement, isValidElement, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { useReadOnly } from "./read-only";

export const inputClass =
  "w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-text placeholder:text-faint transition-colors " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50 aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  // Search fields stay usable on read-only screens.
  const readOnly = useReadOnly() && props.type !== "search";
  return <input className={cn(inputClass, "h-9 [&::-webkit-search-cancel-button]:appearance-none", className)} {...props} readOnly={props.readOnly || readOnly} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const readOnly = useReadOnly();
  return <textarea readOnly={readOnly} className={cn(inputClass, "min-h-20 py-2 leading-relaxed [field-sizing:content]", className)} {...props} />;
}

export type Option = { value: string; label: string; group?: string; disabled?: boolean };

export function Select({
  options,
  className,
  placeholder,
  ...props
}: Omit<React.ComponentProps<"select">, "children"> & { options: Option[]; placeholder?: string }) {
  const readOnly = useReadOnly();
  const groups = new Map<string, Option[]>();
  for (const o of options) {
    const g = o.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  return (
    <select className={cn(inputClass, "h-9 cursor-pointer pr-8", className)} {...props} disabled={props.disabled || readOnly}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {[...groups.entries()].map(([group, opts]) =>
        group ? (
          <optgroup key={group} label={group}>
            {opts.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          opts.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label?: React.ReactNode }) {
  const id = useId();
  const readOnly = useReadOnly();
  return (
    <label htmlFor={props.id ?? id} className={cn("inline-flex cursor-pointer items-center gap-2 text-sm select-none", className)}>
      <input id={props.id ?? id} type="checkbox" className="size-4 cursor-pointer accent-[var(--accent)]" {...props} disabled={props.disabled || readOnly} />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const readOnly = useReadOnly();
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled || readOnly}
        className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-line bg-panel-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-text shadow transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent-ink" />
      </RadixSwitch.Root>
      {label && (
        <label htmlFor={id} className="cursor-pointer text-sm select-none">
          {label}
        </label>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  children,
  required,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  const autoId = useId();
  // A single text control gets linked to the label, so clicking the label focuses it.
  let control = children;
  let controlId: string | undefined;
  if (isValidElement<{ id?: string }>(children) && LABELABLE.has(children.type)) {
    controlId = children.props.id ?? autoId;
    if (!children.props.id) control = cloneElement(children, { id: controlId });
  }
  const labelClass = "text-xs font-medium tracking-wide text-muted uppercase";
  const labelContent = (
    <>
      {label}
      {required && <span className="text-danger"> *</span>}
    </>
  );
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label &&
        (controlId ? (
          <label htmlFor={controlId} className={labelClass}>
            {labelContent}
          </label>
        ) : (
          <span className={labelClass}>{labelContent}</span>
        ))}
      {control}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  );
}

/** Text input that keeps a local draft and reports the value on blur or Enter. */
export function CommitInput({
  value,
  onCommit,
  className,
  multiline,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue"> & {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const readOnly = useReadOnly();
  const shown = editing ? draft : value;
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: shown,
    readOnly: readOnly || undefined,
    onFocus: () => {
      setDraft(value);
      setEditing(true);
    },
    onBlur: commit,
  };
  if (multiline) {
    return (
      <textarea
        {...common}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
            const el = e.target as HTMLTextAreaElement;
            requestAnimationFrame(() => el.blur());
          }
        }}
        id={props.id}
        placeholder={props.placeholder}
        className={cn(inputClass, "min-h-16 py-2 [field-sizing:content]", className)}
      />
    );
  }
  return (
    <input
      {...props}
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        const el = e.target as HTMLInputElement;
        if (e.key === "Enter") el.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
          requestAnimationFrame(() => el.blur());
        }
        props.onKeyDown?.(e);
      }}
      className={cn(inputClass, "h-9", className)}
    />
  );
}

export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(",", ".").replace(/[−–]/g, "-");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Number input that commits on blur/Enter. With `relative`, typing "+5" or
 * "-3" changes the current value instead of replacing it.
 */
export function NumberInput({
  value,
  onCommit,
  min,
  max,
  integer = true,
  relative,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "min" | "max" | "defaultValue"> & {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  relative?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const readOnly = useReadOnly();
  const commit = () => {
    setEditing(false);
    const s = draft.trim().replace(/[−–]/g, "-");
    const rel = relative && /^[+-]/.test(s) && s.length > 1;
    let n = parseNumber(s);
    if (n === null) return;
    if (rel) n = value + n;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onCommit(n);
  };
  return (
    <input
      inputMode={integer ? "numeric" : "decimal"}
      {...props}
      readOnly={props.readOnly || readOnly}
      value={editing ? draft : String(value)}
      onFocus={(e) => {
        setDraft(String(value));
        setEditing(true);
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        const el = e.target as HTMLInputElement;
        if (e.key === "Enter") el.blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
          requestAnimationFrame(() => el.blur());
        }
      }}
      className={cn(inputClass, "h-9 text-center tabular-nums", className)}
    />
  );
}

/** Controls that Field links to its label. */
const LABELABLE = new Set<unknown>(["input", "select", "textarea", Input, Textarea, Select, CommitInput, NumberInput]);
