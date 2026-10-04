"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/rules/ids";
import { docToText, emptyDoc } from "@/lib/rules/richtext";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { CommitInput } from "@/components/ui/input";
import { Empty } from "@/components/ui/misc";
import { useAsk } from "@/components/ui/prompt";
import { makeEvent, useChange, useDoc } from "../store";

export function NotesTab() {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const [selected, setSelected] = useState<string | null>(doc.notes[0]?.id ?? null);
  const page = doc.notes.find((n) => n.id === selected) ?? doc.notes[0] ?? null;

  const add = () => {
    const id = newId("nt");
    change(
      (d) => {
        d.notes.push({ id, title: `Заметка ${d.notes.length + 1}`, content: emptyDoc() });
      },
      makeEvent("edit", "Новая заметка"),
    );
    setSelected(id);
  };

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <div className="flex flex-col gap-1">
        {doc.notes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setSelected(n.id)}
            className={cn(
              "flex flex-col rounded-lg px-3 py-2 text-left transition-colors",
              page?.id === n.id ? "bg-accent-soft text-text" : "text-muted hover:bg-panel-2 hover:text-text",
            )}
          >
            <span className="truncate text-sm font-medium">{n.title || "Без названия"}</span>
            <span className="truncate text-xs text-faint">{docToText(n.content).slice(0, 60) || "пусто"}</span>
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={add} className="mt-1">
          <Plus /> Страница
        </Button>
      </div>
      {page ? (
        <div key={page.id} className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <CommitInput
              value={page.title}
              aria-label="Название заметки"
              className="font-display text-lg font-bold"
              onCommit={(title) =>
                change((d) => {
                  const n = d.notes.find((x) => x.id === page.id);
                  if (n) n.title = title;
                })
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Удалить заметку"
              onClick={async () => {
                const ok = await ask.confirm({ title: `Удалить «${page.title}»?`, confirmLabel: "Удалить", danger: true });
                if (!ok) return;
                change(
                  (d) => {
                    d.notes = d.notes.filter((x) => x.id !== page.id);
                  },
                  makeEvent("edit", `Удалена заметка «${page.title}»`),
                );
                setSelected(null);
              }}
            >
              <Trash2 />
            </Button>
          </div>
          <RichEditor
            value={page.content}
            debounceMs={1200}
            minHeight="24rem"
            placeholder="Сессии, имена, подсказки. Формулы тоже работают: {1d20+INT}"
            onChange={(content) =>
              change((d) => {
                const n = d.notes.find((x) => x.id === page.id);
                if (n) n.content = content;
              })
            }
          />
        </div>
      ) : (
        <Empty icon={<FileText />} title="Заметок нет">
          Страницы для записей по сессиям, NPC и планам.
        </Empty>
      )}
    </div>
  );
}
