"use client";

import { Eye, ScanFace, Search, ShieldHalf } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  ABILITIES,
  ABILITY_LABELS,
  PASSIVE_SKILLS,
  SENSE_LABELS,
  SENSE_TYPES,
  SKILLS,
  SKILL_IDS,
  formatMod,
  type Ability,
  type SkillId,
} from "@/lib/rules/constants";
import { formatStat, type Grant, type Stat } from "@/lib/rules/compute";
import { ABILITY_INFO, CHECK_INFO, PASSIVE_INFO, SAVE_INFO, SKILL_INFO } from "@/lib/rules/glossary";
import type { ProfLevel } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { CommitInput, Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { modeFromEvent, useRollStat } from "./dice";
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

/** Two-part chip: the label opens the breakdown, the value rolls. */
function StatChip({
  label,
  title,
  stat,
  info,
  prof,
  className,
  children,
}: {
  label: string;
  title: string;
  stat: Stat;
  info: string;
  prof?: ProfLevel;
  className?: string;
  children?: React.ReactNode;
}) {
  const rollStat = useRollStat();
  return (
    <div className={cn("flex h-7 min-w-0 items-stretch overflow-hidden rounded-lg border border-line bg-panel-2", className)}>
      <StatPopover
        title={title}
        stat={stat}
        rollLabel={title}
        info={info}
        trigger={
          <button type="button" className="flex min-w-0 flex-1 items-center gap-1 pr-0.5 pl-1 text-xs font-medium text-muted hover:text-text">
            {prof !== undefined && <ProfMark level={prof} />}
            <span className="truncate">{label}</span>
          </button>
        }
      >
        {children}
      </StatPopover>
      <Tip content="Бросить к20. Shift — с преимуществом, Alt — с помехой">
        <button
          type="button"
          onClick={(e) => rollStat(title, stat, modeFromEvent(e))}
          aria-label={`Бросить: ${title}`}
          className={cn(
            "relative flex min-w-8 shrink-0 items-center justify-center border-l border-line px-1 font-display text-[15px] leading-none font-bold tabular-nums transition-colors hover:bg-accent-soft hover:text-accent",
            stat.overridden && "text-accent",
          )}
        >
          {formatStat(stat)}
          <StatFlags stat={stat} />
        </button>
      </Tip>
    </div>
  );
}

function AbilityBlock({ ability, skills, className }: { ability: Ability; skills: SkillId[]; className?: string }) {
  const sheet = useComputed();
  const a = sheet.abilities[ability];
  const label = ABILITY_LABELS[ability];
  return (
    <section aria-label={label.full} className={cn("rounded-xl border border-line bg-panel p-1.5", className)}>
      <StatPopover
        title={label.full}
        stat={a.score}
        signed={false}
        info={ABILITY_INFO[ability]}
        tipTitle={`${label.full} (модификатор ${formatMod(a.mod)})`}
        trigger={
          <button type="button" className="group flex h-5 w-full items-center gap-2 px-1 text-left">
            <span className="font-display text-[15px] leading-none font-bold tracking-wide uppercase group-hover:text-accent">{label.full}</span>
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-faint tabular-nums">{formatMod(a.mod)}</span>
            <span className={cn("relative font-display text-xl leading-none font-bold tabular-nums", a.score.overridden && "text-accent")}>
              {a.score.value}
              {a.score.overridden && <span className="absolute -top-0.5 -right-1.5 size-1.5 rounded-full bg-accent" />}
            </span>
          </button>
        }
      >
        <BaseScoreEditor ability={ability} />
      </StatPopover>
      {/* Equal halves where there is room; in the narrow two-column sidebar the save chip takes the rest. */}
      <div className="mt-1 grid grid-cols-2 gap-1 wide:flex">
        <StatChip label="Проверка" title={`Проверка: ${label.full}`} stat={a.check} info={CHECK_INFO} className="shrink-0" />
        <StatChip label="Спасбросок" title={`Спасбросок: ${label.full}`} stat={a.save} info={SAVE_INFO} prof={sheet.saveProf[ability]} className="flex-1">
          <ProfEditor kind="save" id={ability} />
        </StatChip>
      </div>
      {skills.length > 0 && (
        <div className="mt-0.5 flex flex-col">
          {skills.map((s) => (
            <SkillRow key={s} id={s} />
          ))}
        </div>
      )}
    </section>
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
  const moved = s.ability !== SKILLS[id].ability;
  return (
    <div className="group flex h-7 items-center gap-1.5 rounded-md pr-0.5 pl-1 hover:bg-panel-2 lg:h-6">
      <ProfMark level={s.prof} />
      <StatPopover
        title={label}
        stat={s.stat}
        rollLabel={label}
        info={
          <>
            {SKILL_INFO[id]}
            {moved && (
              <span className="mt-1 block text-accent">
                Считается от {ABILITY_LABELS[s.ability].full} вместо {ABILITY_LABELS[SKILLS[id].ability].full}.
              </span>
            )}
          </>
        }
        trigger={
          <button type="button" className="relative flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm">
            <span className="truncate">{label}</span>
            {moved && <span className="text-[10px] font-semibold tracking-wide text-accent">{ABILITY_LABELS[s.ability].short}</span>}
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
        onClick={(e) => rollStat(label, s.stat, modeFromEvent(e))}
        title="Бросить (Shift — преимущество, Alt — помеха)"
        aria-label={`Бросить: ${label}`}
        className={cn(
          "min-w-9 rounded-md px-1 text-right text-sm font-semibold tabular-nums hover:bg-accent-soft hover:text-accent",
          s.stat.overridden && "text-accent",
        )}
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
          <Tip key={i} content={`Откуда: ${g.source}`}>
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs", tone)}>{g.value}</span>
          </Tip>
        ))}
      </div>
    </div>
  );
}

const PASSIVE_ICONS: Partial<Record<SkillId, React.ComponentType<{ className?: string }>>> = {
  perception: Eye,
  insight: ScanFace,
  investigation: Search,
};

function Senses({ className }: { className?: string }) {
  const sheet = useComputed();
  const doc = useDoc();
  const hidden = new Set(doc.settings.hidden);
  const passives = hidden.has("combat.passives") ? [] : PASSIVE_SKILLS.filter((s) => !hidden.has(`skill.${s}`));
  const senses = SENSE_TYPES.filter((s) => sheet.senses[s].value > 0);
  if (!passives.length && !senses.length) return null;
  return (
    <section aria-label="Чувства" className={cn("flex flex-col gap-1 rounded-xl border border-line bg-panel px-3 py-2", className)}>
      {passives.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Tip content="Пассивные значения: 10 + навык. Мастер сверяет их без броска">
            <span className="mr-auto text-[11px] font-semibold tracking-wide text-muted uppercase">Пассивные</span>
          </Tip>
          {passives.map((s) => {
            const Icon = PASSIVE_ICONS[s] ?? Eye;
            const info = PASSIVE_INFO[s];
            const value = sheet.passives[s].value;
            return (
              <StatPopover
                key={s}
                title={info?.title ?? `Пассивн. ${SKILLS[s].label}`}
                stat={sheet.passives[s]}
                signed={false}
                info={info?.text}
                trigger={
                  <button
                    type="button"
                    aria-label={`${info?.title ?? SKILLS[s].label}: ${value}`}
                    className="flex items-center gap-1 rounded-md px-0.5 text-sm hover:bg-panel-2 hover:text-accent"
                  >
                    <Icon className="size-3.5 text-muted" />
                    <span className="font-semibold tabular-nums">{value}</span>
                  </button>
                }
              />
            );
          })}
        </div>
      )}
      {senses.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {senses.map((s) => (
            <StatPopover
              key={s}
              title={SENSE_LABELS[s]}
              stat={sheet.senses[s]}
              signed={false}
              trigger={
                <button type="button" className="flex items-center gap-1.5 rounded-md text-sm hover:text-accent">
                  <span className="text-muted">{SENSE_LABELS[s]}</span>
                  <span className="font-semibold tabular-nums">{sheet.senses[s].value} фт.</span>
                </button>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

// Single column: the usual order (СИЛ, ЛОВ, ТЕЛ...). Two columns: СИЛ, ТЕЛ, ИНТ, ХАР on the
// left, ЛОВ and МДР on the right, which keeps both columns about the same height.
const COLUMNS: Ability[][] = [
  ["str", "con", "int", "cha"],
  ["dex", "wis"],
];
// Literal class names so Tailwind picks them up. Two columns on phablets/tablets and from the
// `wide` breakpoint; one column in the narrow desktop sidebar (lg).
const ORDER: Record<Ability | "senses" | "defenses" | "hidden", string> = {
  str: "order-1 sm:order-none lg:order-1 wide:order-none",
  dex: "order-2 sm:order-none lg:order-2 wide:order-none",
  con: "order-3 sm:order-none lg:order-3 wide:order-none",
  int: "order-4 sm:order-none lg:order-4 wide:order-none",
  wis: "order-5 sm:order-none lg:order-5 wide:order-none",
  cha: "order-6 sm:order-none lg:order-6 wide:order-none",
  senses: "order-7 sm:order-none lg:order-7 wide:order-none",
  defenses: "order-8 sm:order-none lg:order-8 wide:order-none",
  hidden: "order-9 sm:order-none lg:order-9 wide:order-none",
};
const STACK = "contents sm:flex sm:flex-col sm:gap-1.5 lg:contents wide:flex";

export function Sidebar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const sheet = useComputed();
  const doc = useDoc();
  const hidden = new Set(doc.settings.hidden);
  const shown = SKILL_IDS.filter((s) => !hidden.has(`skill.${s}`));
  const skillsOf = (a: Ability) => shown.filter((s) => sheet.skills[s].ability === a).sort((x, y) => SKILLS[x].label.localeCompare(SKILLS[y].label, "ru"));
  const d = sheet.defenses;
  const hasDefenses = d.resist.length + d.immune.length + d.vulnerable.length + d.condimmune.length > 0;
  const hiddenCount = SKILL_IDS.length - shown.length;
  return (
    <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 sm:items-start sm:gap-x-1.5 lg:flex lg:flex-col wide:grid wide:grid-cols-2">
      {COLUMNS.map((column, i) => (
        <div key={i} className={STACK}>
          {column.map((a) => (
            <AbilityBlock key={a} ability={a} skills={skillsOf(a)} className={ORDER[a]} />
          ))}
          {i === 1 && (
            <>
              <Senses className={ORDER.senses} />
              {hasDefenses && (
                <section aria-label="Защиты" className={cn("flex flex-col gap-2 rounded-xl border border-line bg-panel px-3 py-2", ORDER.defenses)}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                    <ShieldHalf className="size-3.5" /> Защиты
                  </div>
                  <GrantList title="Сопротивления" grants={d.resist} tone="bg-info-soft text-info" />
                  <GrantList title="Иммунитеты" grants={d.immune} tone="bg-good-soft text-good" />
                  <GrantList title="Уязвимости" grants={d.vulnerable} tone="bg-danger-soft text-danger" />
                  <GrantList title="Иммунитет к состояниям" grants={d.condimmune} tone="bg-magic-soft text-magic" />
                </section>
              )}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  disabled={!onOpenSettings}
                  className={cn("px-1 text-left text-[11px] text-faint hover:text-text disabled:hover:text-faint", ORDER.hidden)}
                >
                  Скрыто навыков: {hiddenCount}. Вернуть можно в настройках.
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
