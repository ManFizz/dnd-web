"use client";

import { Tooltip } from "radix-ui";
import { Toaster } from "sonner";
import { PromptProvider } from "@/components/ui/prompt";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={150}>
      <PromptProvider>{children}</PromptProvider>
      <Toaster
        position="bottom-right"
        theme="system"
        closeButton
        toastOptions={{
          classNames: {
            toast: "!bg-panel !border-line !text-text !shadow-[var(--shadow)]",
            description: "!text-muted",
          },
        }}
      />
    </Tooltip.Provider>
  );
}
