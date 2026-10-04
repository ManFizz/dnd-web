"use client";

import { X } from "lucide-react";
import { Dialog, DropdownMenu, Popover as RadixPopover, Tooltip } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const MODAL_SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  onOpenAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof MODAL_SIZES;
  className?: string;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/55" />
        <Dialog.Content
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            "anim-pop fixed top-[max(12px,6vh)] left-1/2 z-50 flex max-h-[calc(100dvh-max(24px,12vh))] w-[calc(100vw-24px)] -translate-x-1/2 flex-col",
            "rounded-xl border border-line bg-panel shadow-[var(--shadow)] focus:outline-none",
            MODAL_SIZES[size],
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg leading-snug font-bold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Диалог"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Закрыть" className="-mr-1.5">
                <X />
              </Button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const TIP_CONTENT_CLASS =
  "z-[60] max-w-xs rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs leading-relaxed text-text shadow-[var(--shadow)]";

export function Popover({
  trigger,
  tip,
  children,
  open,
  onOpenChange,
  side = "bottom",
  align = "start",
  className,
  modal,
}: {
  trigger: React.ReactNode;
  /** Hover hint for the trigger; hidden while the popover is open. */
  tip?: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
  modal?: boolean;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const triggerEl = <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>;
  return (
    <RadixPopover.Root open={isOpen} onOpenChange={setOpen} modal={modal}>
      {tip ? (
        <Tooltip.Root open={tipOpen && !isOpen} onOpenChange={setTipOpen}>
          {/* Focus returns to the trigger when the popover closes; that must not pop the hint. */}
          <Tooltip.Trigger asChild onFocus={(e) => e.preventDefault()}>
            {triggerEl}
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="top" sideOffset={5} collisionPadding={8} className={TIP_CONTENT_CLASS}>
              {tip}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        triggerEl
      )}
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={10}
          className={cn(
            "anim-pop z-50 max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-20px)] overflow-y-auto",
            "rounded-xl border border-line bg-panel p-3 shadow-[var(--shadow)] focus:outline-none",
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export const PopoverClose = RadixPopover.Close;

export function Tip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  if (content === null || content === undefined || content === "") return <>{children}</>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={5} collisionPadding={8} className={cn(TIP_CONTENT_CLASS, className)}>
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Full-height panel sliding in from the right, for secondary screens (journal, settings). */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/45" />
        <Dialog.Content
          className={cn(
            "anim-slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-line bg-bg shadow-[var(--shadow)] focus:outline-none",
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line bg-panel px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg leading-snug font-bold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Панель"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Закрыть" className="-mr-1.5">
                <X />
              </Button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type MenuItem =
  | { label: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | "separator";

export function Menu({ trigger, items, align = "end" }: { trigger: React.ReactNode; items: MenuItem[]; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={10}
          className="anim-pop z-50 min-w-48 rounded-xl border border-line bg-panel p-1 shadow-[var(--shadow)]"
        >
          {items.map((item, idx) =>
            item === "separator" ? (
              <DropdownMenu.Separator key={idx} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={idx}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-panel-2 [&_svg]:size-4",
                  item.danger ? "text-danger" : "text-text",
                )}
              >
                {item.icon}
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
