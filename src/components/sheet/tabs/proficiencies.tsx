"use client";

import { Lock, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { ABILITIES, ABILITY_LABELS, SKILLS, SKILL_IDS } from "@/lib/rules/constants";
import { formatStat } from "@/lib/rules/compute";
import { newId } from "@/lib/rules/ids";
import { LANGUAGES, TOOLS, WEAPONS } from "@/lib/rules/suggestions";
import { ARMOR_PROFS } from "@/lib/rules/tables";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { ProfEditor, ProfMark } from "../sidebar";
import { makeEvent, useChange, useComputed, useDoc } from "../store";

type ProfKind = "armor" | "weapons" | "tools" | "languages" | "other";

const KINDS: { kind: ProfKind; title: string; suggestions: string[]; placeholder: string }[] = [
  { kind: "armor", title: "Доспехи и щиты", suggestions: ARMOR_PROFS, placeholder: "Лёгкие доспехи" },
  { kind: "weapons", title: "Оружие", suggestions: WEAPONS, placeholder: "Простое оружие" },
  { kind: "tools", title: "Инструменты", suggestions: TOOLS, placeholder: "Воровские инструменты" },
  { kind: "languages", title: "Языки", suggestions: LANGUAGES, placeholder: "Эльфийский" },
  { kind: "other", title: "Прочее", suggestions: [], placeholder: "Транспорт, игры…" },
];

function ProfList({ kind, title, suggestions, placeholder }: (typeof KINDS)[number]) {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const listId = useId();
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const own = doc.proficiencies[kind];
  const granted = sheet.proficiencies[kind].filter((g) => g.sourceType !== "base");
  const needSource = doc.settings.requireReasons;
  const add = () => {
    const n = name.trim();
    if (!n || (needSource && !source.trim())) return;
    change(
      (d) => {
        d.proficiencies[kind].push({ id: newId("pf"), name: n, source: source.trim() });
      },
      makeEvent("edit", `Владение (${title.toLowerCase()}): ${n}`, source.trim()),
    );
    setName("");
    setSource("");
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {own.map((p) => (
          <Tip key={p.id} content={p.source ? `Откуда: ${p.source}` : "Источник не указан"}>
            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel-2 py-1 pr-1 pl-2 text-sm">
              {p.name}
              <button
                type="button"
                aria-label={`Убрать ${p.name}`}
                className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-text"
                onClick={() =>
                  change(
                    (d) => {
                      d.proficiencies[kind] = d.proficiencies[kind].filter((x) => x.id !== p.id);
                    },
                    makeEvent("edit", `Убрано владение: ${p.name}`),
                  )
                }
              >
                <X className="size-3" />
              </button>
            </span>
          </Tip>
        ))}
        {granted.map((g, i) => (
          <Tip key={`g${i}`} content={`Даёт: ${g.source}. Меняется там, где задан эффект.`}>
            <span className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-soft px-2 py-1 text-sm text-accent">
              <Lock className="size-3" /> {g.value}
            </span>
          </Tip>
        ))}
        {!own.length && !granted.length && <span className="text-sm text-faint">Нет</span>}
      </div>
      <form
        className="flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} list={suggestions.length ? listId : undefined} className="h-8 min-w-36 flex-1 text-sm" />
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={needSource ? "Откуда (обязательно)" : "Откуда"}
          className="h-8 min-w-36 flex-1 text-sm"
        />
        <Button size="sm" variant="outline" type="submit" disabled={!name.trim() || (needSource && !source.trim())}>
          <Plus /> Добавить
        </Button>
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </form>
    </div>
  );
}

export function ProficienciesTab() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const hidden = new Set(doc.settings.hidden);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Спасброски" bodyClassName="flex flex-col gap-1 p-2">
          {ABILITIES.map((a) => (
            <div key={a} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 hover:bg-panel-2 sm:grid-cols-[9rem_1fr_3rem]">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ProfMark level={sheet.saveProf[a]} />
                {ABILITY_LABELS[a].full}
              </div>
              <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                <ProfEditor kind="save" id={a} />
              </div>
              <div className="col-start-2 row-start-1 text-right font-semibold tabular-nums sm:col-start-auto sm:row-start-auto">{formatStat(sheet.abilities[a].save)}</div>
            </div>
          ))}
        </Panel>
        <Panel title="Навыки" bodyClassName="flex flex-col gap-1 p-2">
          {SKILL_IDS.filter((s) => !hidden.has(`skill.${s}`)).map((s) => (
            <div key={s} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 hover:bg-panel-2 sm:grid-cols-[9rem_1fr_3rem]">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ProfMark level={sheet.skills[s].prof} />
                <span className="truncate">{SKILLS[s].label}</span>
              </div>
              <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                <ProfEditor kind="skill" id={s} />
              </div>
              <div className="col-start-2 row-start-1 text-right font-semibold tabular-nums sm:col-start-auto sm:row-start-auto">{formatStat(sheet.skills[s].stat)}</div>
            </div>
          ))}
        </Panel>
      </div>
      <Panel title="Владения и языки" bodyClassName="flex flex-col gap-5 p-4">
        {KINDS.map((k) => (
          <ProfList key={k.kind} {...k} />
        ))}
        <p className="text-xs text-muted">Владения с замком даёт предмет, особенность или бонус — они пропадут вместе с источником.</p>
      </Panel>
      <Panel title="Заметки о владениях">
        <RichEditor
          value={doc.proficiencies.notes}
          debounceMs={1200}
          placeholder="Например: владение Анализом только для ловушек"
          onChange={(v) =>
            change((d) => {
              d.proficiencies.notes = v;
            })
          }
        />
      </Panel>
    </div>
  );
}
