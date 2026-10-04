"use client";

import { ALIGNMENTS } from "@/lib/rules/constants";
import type { CharacterDoc } from "@/lib/rules/schema";
import { RichEditor } from "@/components/rich/editor";
import { CommitInput, Field } from "@/components/ui/input";
import { Panel } from "@/components/ui/misc";
import { makeEvent, useChange, useDoc } from "../store";

type InfoKey = keyof CharacterDoc["info"];
type LoreKey = keyof CharacterDoc["lore"];

const INFO_FIELDS: { key: Exclude<InfoKey, "size" | "xp" | "race">; label: string; placeholder?: string }[] = [
  { key: "background", label: "Предыстория", placeholder: "Мудрец" },
  { key: "alignment", label: "Мировоззрение" },
  { key: "faith", label: "Вера", placeholder: "Божество, культ" },
  { key: "playerName", label: "Игрок" },
  { key: "age", label: "Возраст" },
  { key: "height", label: "Рост" },
  { key: "weight", label: "Вес" },
  { key: "eyes", label: "Глаза" },
  { key: "skin", label: "Кожа" },
  { key: "hair", label: "Волосы" },
];

const SMALL: { key: LoreKey; title: string; placeholder: string }[] = [
  { key: "personality", title: "Черты характера", placeholder: "Каким персонажа видят окружающие" },
  { key: "ideals", title: "Идеалы", placeholder: "Во что он верит" },
  { key: "bonds", title: "Привязанности", placeholder: "Люди, места, обещания" },
  { key: "flaws", title: "Слабости", placeholder: "Пороки, страхи, тайны" },
];

const LARGE: { key: LoreKey; title: string; placeholder: string }[] = [
  { key: "appearance", title: "Внешность", placeholder: "Как выглядит, во что одет, особые приметы" },
  { key: "backstory", title: "История персонажа", placeholder: "Откуда он, что с ним случилось до начала приключений" },
  { key: "background", title: "Предыстория", placeholder: "Подробности предыстории и её умения" },
  { key: "allies", title: "Союзники и организации", placeholder: "Гильдии, друзья, враги" },
];

function LoreEditor({ k, placeholder }: { k: LoreKey; placeholder: string }) {
  const doc = useDoc();
  const change = useChange();
  return (
    <RichEditor
      value={doc.lore[k]}
      debounceMs={1200}
      placeholder={placeholder}
      minHeight="5rem"
      onChange={(v) =>
        change((d) => {
          d.lore[k] = v;
        })
      }
    />
  );
}

export function LoreTab() {
  const doc = useDoc();
  const change = useChange();
  return (
    <div className="flex flex-col gap-4">
      {/* Goals change every session, so they come first. */}
      <Panel title="Цели и задания">
        <LoreEditor k="quests" placeholder="Что персонаж хочет и что ему поручили" />
      </Panel>
      <Panel title="Кратко">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {INFO_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} className={f.key === "background" || f.key === "alignment" ? "col-span-2 md:col-span-1" : undefined}>
              <CommitInput
                value={doc.info[f.key]}
                placeholder={f.placeholder}
                list={f.key === "alignment" ? "alignments" : undefined}
                onCommit={(v) =>
                  change(
                    (d) => {
                      d.info[f.key] = v;
                    },
                    makeEvent("edit", `${f.label}: ${v || "—"}`),
                  )
                }
              />
            </Field>
          ))}
          <datalist id="alignments">
            {ALIGNMENTS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {SMALL.map((s) => (
          <Panel key={s.key} title={s.title}>
            <LoreEditor k={s.key} placeholder={s.placeholder} />
          </Panel>
        ))}
      </div>
      {LARGE.map((s) => (
        <Panel key={s.key} title={s.title}>
          <LoreEditor k={s.key} placeholder={s.placeholder} />
        </Panel>
      ))}
    </div>
  );
}
