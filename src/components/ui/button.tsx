import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong border-transparent font-semibold",
  secondary: "bg-panel-2 text-text hover:bg-panel-3 border-line",
  outline: "bg-transparent text-text hover:bg-panel-2 border-line",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-panel-2 border-transparent",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white border-transparent",
  subtle: "bg-accent-soft text-accent hover:bg-accent hover:text-accent-ink border-transparent",
} as const;

const SIZES = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-2.5 text-sm gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-base gap-2 rounded-lg",
  icon: "h-9 w-9 rounded-lg",
  "icon-sm": "h-7 w-7 rounded-md",
} as const;

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  asChild?: boolean;
};

export function Button({ variant = "secondary", size = "md", asChild, className, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border whitespace-nowrap transition-colors select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-45",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
