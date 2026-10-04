"use client";

import { useState } from "react";
import type { Note, Stat } from "@/lib/rules/compute";
import { ABILITIES, ABILITY_LABELS, formatMod, SKILL_IDS, SKILLS } from "@/lib/rules/constants";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import type { PartySheet } from "./party";

// One table with every party bonus, so the GM can say "roll Perception" and
// already know who is likely to succeed, without asking the table.

type Row = { key: string; label: string; get: (p: PartySheet) => Stat | null };

const GROUPS: Record<"skills" | "saves" | "checks", { label: string; rows: Row[] }> = {
  skills: {
    label: "Навыки",
    rows: SKILL_IDS.map((s) => ({
      key: `skill.${s}`,
      label: `${SKILLS[s].label} (${ABILITY_LABELS[SKILLS[s].ability].short})`,
      get: (p) => (p.doc.settings.hidden.includes(`skill.${s}`) ? null : p.sheet.skills[s].stat),
    })),
  },
  saves: {
    label: "Спасброски",
    rows: ABILITIES.map((a) => ({
      key: `save.${a}`,
      label: ABILITY_LABELS[a].full,
      get: (p) => p.sheet.abilities[a].save,
    })),
  },
  checks: {
    label: "Проверки характеристик",
    rows: ABILITIES.map((a) => ({
      key: `check.${a}`,
      label: ABILITY_LABELS[a].full,
      get: (p) => p.sheet.abilities[a].check,
    })),
  },
};

function Cell({ stat, best }: { stat: Stat | null; best: boolean }) {
  if (!stat) return <span className="text-faint">—</span>;
  const note = (n: Note) => [n.source, n.text].filter(Boolean).join(": ");
  const notes = [...stat.adv.map((n) => `Преимущество: ${note(n)}`), ...stat.dis.map((n) => `Помеха: ${note(n)}`)];
  return (
    <Tip content={notes.length ? notes.join("\n") : undefined} className="whitespace-pre-line">
      <span className={cn("inline-flex items-center gap-1 tabular-nums", best && "font-bold text-accent")}>
        {formatMod(stat.value)}
        {stat.adv.length > 0 && <span className="rounded bg-good-soft px-1 text-[10px] font-semibold text-good">П</span>}
        {stat.dis.length > 0 && <span className="rounded bg-danger-soft px-1 text-[10px] font-semibold text-danger">П−</span>}
      </span>
    </Tip>
  );
}

export function PartyBonuses({ sheets }: { sheets: PartySheet[] }) {
  const [group, setGroup] = useState<keyof typeof GROUPS>("skills");
  if (!sheets.length) return <p className="text-sm text-muted">Таблица появится, когда в партии будут персонажи.</p>;
  const rows = GROUPS[group].rows;
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        value={group}
        onChange={setGroup}
        options={(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((k) => ({
          value: k,
          label: GROUPS[k].label,
        }))}
      />
      <p className="text-xs text-muted">
        Итоговые бонусы со всеми эффектами. «П» значит преимущество, «П−» помеха; наведите, чтобы увидеть источник. Лучший в партии выделен.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-panel-2 text-left">
              <th className="sticky left-0 z-10 bg-panel-2 px-3 py-2 font-medium text-muted">{GROUPS[group].label}</th>
              {sheets.map((p) => (
                <th key={p.characterId} className="px-3 py-2 text-center font-display font-bold whitespace-nowrap">
                  {p.doc.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const stats = sheets.map((p) => row.get(p));
              const top = Math.max(...stats.map((s) => (s ? s.value : -Infinity)));
              return (
                <tr key={row.key} className="border-t border-line">
                  <th className="sticky left-0 z-10 bg-panel px-3 py-1.5 text-left font-normal whitespace-nowrap">{row.label}</th>
                  {stats.map((s, i) => (
                    <td key={sheets[i].characterId} className="bg-panel px-3 py-1.5 text-center">
                      <Cell stat={s} best={sheets.length > 1 && !!s && s.value === top} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
