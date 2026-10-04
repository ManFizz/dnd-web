"use client";

import { Eye, ShieldHalf } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ABILITIES, ABILITY_LABELS, PASSIVE_SKILLS, SENSE_LABELS, SENSE_TYPES, SKILLS, SKILL_IDS, type Ability, type SkillId } from "@/lib/rules/constants";
import { formatStat, type Grant } from "@/lib/rules/compute";
import type { ProfLevel } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { CommitInput, Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Panel, Segmented } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { DiceButton, useRollStat } from "./dice";
import { StatFlags, StatPopover } from "./stat";
import { makeEvent, useChange, useComputed, useDoc } from "./store";

export function ProfMark({ level, className }: { level: ProfLevel; className?: string }) {
  const title = level === 2 ? "Экспертиза" : level === 1 ? "Владение" : level === 0.5 ? "Половина бонуса мастерства" : "Нет владения";
  return (
    <span title={title} className={cn("inline-flex size-3.5 shrink-0 items-center justify-center", className)}>
      {level === 0 && <span className="size-2.5 rounded-full border border-line-strong" />}
      {level === 0.5 && <span className="size-2.5 rounded-full border border-accent bg-[linear-gradient(90deg,var(--accent)_50%,transparent_50%)]" />}
      {level === 1 && <span className="size-2.5 rounded-full bg-accent" />}
      {level === 2 && <span className="size-3 rounded-full border-2 border-accent bg-accent ring-2 ring-accent/30" />}
    </span>
  );
}

const PROF_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Нет" },
  { value: "0.5", label: "½" },
  { value: "1", label: "Владение" },
  { value: "2", label: "Эксп." },
];

const profName = (l: number) => (l === 2 ? "экспертиза" : l === 1 ? "владение" : l === 0.5 ? "половина" : "нет");

/** Proficiency level and its source for a save or a skill. */
export function ProfEditor({ kind, id }: { kind: "save" | "skill"; id: string }) {
  const doc = useDoc();
  const change = useChange();
  const entry = kind === "save" ? doc.saves[id as Ability] : doc.skills[id as SkillId];
  const title = kind === "save" ? `Спасбросок ${ABILITY_LABELS[id as Ability].full}` : SKILLS[id as SkillId].label;
  const setLevel = (raw: string) => {
    const level = Number(raw) as ProfLevel;
    if (level === entry.prof) return;
    change(
      (d) => {
        const e = kind === "save" ? d.saves[id as Ability] : d.skills[id as SkillId];
        e.prof = level;
      },
      makeEvent("edit", `${title}: ${profName(entry.prof)} → ${profName(level)}`, entry.source),
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <Segmented size="sm" value={String(entry.prof)} onChange={setLevel} options={PROF_OPTIONS} />
      <CommitInput
        value={entry.source}
        placeholder="Откуда владение: класс, предыстория, черта"
        className="h-8 text-xs"
        onCommit={(source) =>
          change(
            (d) => {
              const e = kind === "save" ? d.saves[id as Ability] : d.skills[id as SkillId];
              e.source = source;
            },
            makeEvent("edit", `${title}: источник владения «${source}»`),
          )
        }
      />
    </div>
  );
}

function BaseScoreEditor({ ability }: { ability: Ability }) {
  const doc = useDoc();
  const change = useChange();
  const base = doc.abilities[ability].base;
  const [value, setValue] = useState(base);
  const [reason, setReason] = useState("");
  const required = doc.settings.requireReasons;
  const dirty = value !== base;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
      <div className="text-xs text-muted">Базовое значение (без бонусов). Повышения от уровней и предметов лучше добавлять бонусами.</div>
      <div className="flex items-center gap-2">
        <NumberInput value={value} min={1} max={30} onCommit={setValue} className="w-16" />
        {dirty && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={required ? "Причина (обязательно)" : "Причина"} className="h-9 text-xs" />}
      </div>
      {dirty && (
        <Button
          size="sm"
          variant="primary"
          disabled={required && !reason.trim()}
          onClick={() =>
            change(
              (d) => {
                d.abilities[ability].base = value;
              },
              makeEvent("edit", `${ABILITY_LABELS[ability].full}: база ${base} → ${value}`, reason.trim()),
            )
          }
        >
          Сохранить базу
        </Button>
      )}
    </div>
  );
}

function AbilityCard({ ability }: { ability: Ability }) {
  const sheet = useComputed();
  const rollStat = useRollStat();
  const a = sheet.abilities[ability];
  const label = ABILITY_LABELS[ability];
  const saveProf = sheet.saveProf[ability];
  return (
    <div className="relative flex flex-col items-center rounded-xl border border-line bg-panel-2 px-1.5 pt-2 pb-1.5">
      <div className="text-[11px] font-semibold tracking-widest text-muted">{label.short}</div>
      <StatPopover
        title={`${label.full}: проверка`}
        stat={a.check}
        rollLabel={`Проверка ${label.full}`}
        trigger={
          <button type="button" className="relative font-display text-[26px] leading-tight font-bold tabular-nums hover:text-accent">
            {formatStat(a.check)}
            <StatFlags stat={a.check} />
          </button>
        }
      />
      <StatPopover
        title={label.full}
        stat={a.score}
        signed={false}
        trigger={
          <button
            type="button"
            className={cn(
              "relative -mt-0.5 rounded-full border border-line bg-panel px-2 text-xs font-semibold tabular-nums hover:border-accent",
              a.score.overridden && "text-accent",
            )}
          >
            {a.score.value}
            {a.score.overridden && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-accent" />}
          </button>
        }
      >
        <BaseScoreEditor ability={ability} />
      </StatPopover>
      <div className="mt-1.5 flex w-full items-center justify-between gap-1 border-t border-line pt-1">
        <StatPopover
          title={`Спасбросок ${label.full}`}
          stat={a.save}
          rollLabel={`Спасбросок ${label.full}`}
          trigger={
            <button type="button" className="flex min-w-0 items-center gap-1 text-xs tabular-nums hover:text-accent" title="Спасбросок">
              <ProfMark level={saveProf} />
              <span className="font-semibold">{formatStat(a.save)}</span>
              <StatFlags stat={a.save} />
            </button>
          }
        >
          <ProfEditor kind="save" id={ability} />
        </StatPopover>
        <DiceButton onRoll={(mode) => rollStat(`Спасбросок ${label.full}`, a.save, mode)} title="Спасбросок (Shift — преимущество, Alt — помеха)" />
      </div>
    </div>
  );
}

function SkillRow({ id }: { id: SkillId }) {
  const sheet = useComputed();
  const doc = useDoc();
  const change = useChange();
  const rollStat = useRollStat();
  const s = sheet.skills[id];
  const label = SKILLS[id].label;
  const abilityOverride = doc.skills[id].ability;
  return (
    <div className="group flex items-center gap-2 rounded-md px-1.5 py-[3px] hover:bg-panel-2">
      <ProfMark level={s.prof} />
      <StatPopover
        title={label}
        stat={s.stat}
        rollLabel={label}
        trigger={
          <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm">
            <span className="truncate">{label}</span>
            <span className="text-[10px] font-semibold tracking-wide text-faint">{ABILITY_LABELS[s.ability].short}</span>
            <StatFlags stat={s.stat} />
          </button>
        }
      >
        <ProfEditor kind="skill" id={id} />
        <Field label="Характеристика навыка">
          <Select
            value={abilityOverride}
            onChange={(e) =>
              change(
                (d) => {
                  d.skills[id].ability = e.target.value as Ability | "";
                },
                makeEvent("edit", `${label}: характеристика ${e.target.value ? ABILITY_LABELS[e.target.value as Ability].short : "по умолчанию"}`),
              )
            }
            options={[
              { value: "", label: `По умолчанию (${ABILITY_LABELS[SKILLS[id].ability].short})` },
              ...ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a].full })),
            ]}
          />
        </Field>
      </StatPopover>
      <button
        type="button"
        onClick={(e) => rollStat(label, s.stat, e.shiftKey ? "adv" : e.altKey || e.ctrlKey ? "dis" : null)}
        title="Бросить (Shift — преимущество, Alt — помеха)"
        className={cn("min-w-9 rounded-md px-1 text-right text-sm font-semibold tabular-nums hover:bg-accent-soft hover:text-accent", s.stat.overridden && "text-accent")}
      >
        {formatStat(s.stat)}
      </button>
    </div>
  );
}

function GrantList({ title, grants, tone }: { title: string; grants: Grant[]; tone: string }) {
  if (!grants.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</div>
      <div className="flex flex-wrap gap-1">
        {grants.map((g, i) => (
          <Tip key={i} content={g.source}>
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs", tone)}>{g.value}</span>
          </Tip>
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const sheet = useComputed();
  const doc = useDoc();
  const hidden = new Set(doc.settings.hidden);
  const skills = SKILL_IDS.filter((s) => !hidden.has(`skill.${s}`));
  const senses = SENSE_TYPES.filter((s) => sheet.senses[s].value > 0);
  const d = sheet.defenses;
  const hasDefenses = d.resist.length + d.immune.length + d.vulnerable.length + d.condimmune.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((a) => (
          <AbilityCard key={a} ability={a} />
        ))}
      </div>
      <Panel title="Навыки" bodyClassName="p-1.5">
        <div className="flex flex-col">
          {skills.map((s) => (
            <SkillRow key={s} id={s} />
          ))}
        </div>
        {skills.length < SKILL_IDS.length && (
          <div className="px-1.5 pt-1.5 text-[11px] text-faint">Скрыто навыков: {SKILL_IDS.length - skills.length} (настройки)</div>
        )}
      </Panel>
      {(!hidden.has("combat.passives") || senses.length > 0) && (
        <Panel title="Чувства" bodyClassName="flex flex-col gap-1.5 p-3">
          {!hidden.has("combat.passives") &&
            PASSIVE_SKILLS.filter((s) => !hidden.has(`skill.${s}`)).map((s) => (
              <StatPopover
                key={s}
                title={`Пассивная ${SKILLS[s].label.toLowerCase()}`}
                stat={sheet.passives[s]}
                signed={false}
                trigger={
                  <button type="button" className="flex items-center justify-between gap-2 rounded-md px-1 text-sm hover:bg-panel-2">
                    <span className="flex items-center gap-1.5 text-muted">
                      <Eye className="size-3.5" /> Пасс. {SKILLS[s].label.toLowerCase()}
                    </span>
                    <span className="font-semibold tabular-nums">{sheet.passives[s].value}</span>
                  </button>
                }
              />
            ))}
          {senses.map((s) => (
            <StatPopover
              key={s}
              title={SENSE_LABELS[s]}
              stat={sheet.senses[s]}
              signed={false}
              trigger={
                <button type="button" className="flex items-center justify-between gap-2 rounded-md px-1 text-sm hover:bg-panel-2">
                  <span className="text-muted">{SENSE_LABELS[s]}</span>
                  <span className="font-semibold tabular-nums">{sheet.senses[s].value} фт.</span>
                </button>
              }
            />
          ))}
        </Panel>
      )}
      {hasDefenses && (
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <ShieldHalf className="size-4 text-muted" /> Защиты
            </span>
          }
          bodyClassName="flex flex-col gap-2.5 p-3"
        >
          <GrantList title="Сопротивления" grants={d.resist} tone="bg-info-soft text-info" />
          <GrantList title="Иммунитеты" grants={d.immune} tone="bg-good-soft text-good" />
          <GrantList title="Уязвимости" grants={d.vulnerable} tone="bg-danger-soft text-danger" />
          <GrantList title="Иммунитет к состояниям" grants={d.condimmune} tone="bg-magic-soft text-magic" />
        </Panel>
      )}
    </div>
  );
}

