"use client";

import { cn } from "@/lib/cn";

const BADGE_TONES = {
  neutral: "bg-panel-3 text-muted",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  good: "bg-good-soft text-good",
  info: "bg-info-soft text-info",
  magic: "bg-magic-soft text-magic",
} as const;

export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap", BADGE_TONES[tone], className)}
      {...props}
    />
  );
}

export function Panel({
  title,
  actions,
  className,
  bodyClassName,
  children,
  id,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-xl border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-line px-4 py-2">
          <h3 className="font-display text-base font-bold">{title}</h3>
          {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-1">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Empty({ icon, title, children, className }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-8 text-center", className)}>
      {icon && <div className="text-faint [&_svg]:size-7">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-lg border border-line bg-panel-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
            o.value === value ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Row of circles for slots, charges and similar resources. Filled = available. */
export function Pips({
  total,
  available,
  onChange,
  tone = "accent",
  label,
  max = 20,
}: {
  total: number;
  available: number;
  onChange?: (available: number) => void;
  tone?: "accent" | "magic" | "good" | "danger";
  label?: string;
  max?: number;
}) {
  if (total <= 0) return null;
  if (total > max) return null;
  const fill = { accent: "bg-accent border-accent", magic: "bg-magic border-magic", good: "bg-good border-good", danger: "bg-danger border-danger" }[tone];
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={label}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < available;
        return (
          <button
            key={i}
            type="button"
            disabled={!onChange}
            title={filled ? "Потратить" : "Восстановить"}
            onClick={() => onChange?.(filled ? i : i + 1)}
            className={cn(
              "size-4 rounded-full border-2 transition-colors disabled:cursor-default",
              filled ? fill : "border-line-strong bg-transparent hover:border-muted",
            )}
          />
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-panel-2 px-1 py-px font-sans text-[11px] text-muted">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}
