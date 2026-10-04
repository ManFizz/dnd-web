"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

export type Theme = "dark" | "light";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The theme is applied by an inline script in the root layout before paint. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const set = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      // Private mode: the choice lasts until reload.
    }
  }, []);
  return [theme, set];
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button
      size="icon"
      variant="ghost"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={next === "light" ? "Светлая тема" : "Тёмная тема"}
      title={next === "light" ? "Светлая тема" : "Тёмная тема"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
