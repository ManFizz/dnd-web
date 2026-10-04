"use client";

import { ChevronDown, ChevronRight, Plus, Swords, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ABILITIES, ABILITY_LABELS, DAMAGE_TYPES } from "@/lib/rules/constants";
import { formatStat, type AttackRow } from "@/lib/rules/compute";
import { newAttack } from "@/lib/rules/defaults";
import type { Attack } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { modeFromEvent, statMode, useRoll } from "./dice";
import { FormulaPreview } from "./effects";

export const ATTACK_ABILITY_OPTIONS = [
  { value: "str", label: "Сила" },
  { value: "dex", label: "Ловкость" },
  { value: "finesse", label: "Фехтовальное (лучшая из СИЛ/ЛОВ)" },
  { value: "con", label: "Телосложение" },
  { value: "int", label: "Интеллект" },
  { value: "wis", label: "Мудрость" },
  { value: "cha", label: "Харизма" },
  { value: "spell", label: "Заклинательная характеристика" },
  { value: "none", label: "Без характеристики" },
];

export const ACTIVATION_LABELS: Record<Attack["activation"], string> = {
  action: "Действие",
  bonus: "Бонусное действие",
  reaction: "Реакция",
  free: "Свободно",
  other: "Другое",
};

const DAMAGE_LIST_ID = "damage-types";

export function DamageTypesDatalist() {
  return (
    <datalist id={DAMAGE_LIST_ID}>
      {DAMAGE_TYPES.map((d) => (
        <option key={d.id} value={d.label} />
      ))}
    </datalist>
  );
}

export function AttackEditor({ attack, onChange }: { attack: Attack; onChange: (a: Attack) => void }) {
  const set = <K extends keyof Attack>(k: K, v: Attack[K]) => onChange({ ...attack, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Название" className="sm:col-span-2">
        <Input value={attack.name} onChange={(e) => set("name", e.target.value)} placeholder="Когти, Огненное дыхание…" />
      </Field>
      <Field label="Тип">
        <Select
          value={attack.kind}
          onChange={(e) => set("kind", e.target.value as Attack["kind"])}
          options={[
            { value: "attack", label: "Бросок атаки" },
            { value: "save", label: "Спасбросок цели" },
            { value: "other", label: "Без броска" },
          ]}
        />
      </Field>
      <Field label="Действие">
        <Select
          value={attack.activation}
          onChange={(e) => set("activation", e.target.value as Attack["activation"])}
          options={Object.entries(ACTIVATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </Field>
      <Field label="Характеристика">
        <Select value={attack.ability} onChange={(e) => set("ability", e.target.value as Attack["ability"])} options={ATTACK_ABILITY_OPTIONS} />
      </Field>
      {attack.kind === "attack" ? (
        <Field label="Доп. бонус атаки" hint={<FormulaPreview formula={attack.bonus} />}>
          <Input value={attack.bonus} onChange={(e) => set("bonus", e.target.value)} placeholder="например 1 или PROF" className="font-mono" />
        </Field>
      ) : attack.kind === "save" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Спасбросок">
            <Select
              value={attack.saveAbility}
              onChange={(e) => set("saveAbility", e.target.value as Attack["saveAbility"])}
              options={[{ value: "", label: "—" }, ...ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a].short }))]}
            />
          </Field>
          <Field label="Сложность" hint={attack.saveDc ? <FormulaPreview formula={attack.saveDc} /> : "СЛ заклинаний"}>
            <Input value={attack.saveDc} onChange={(e) => set("saveDc", e.target.value)} placeholder="авто" className="font-mono" />
          </Field>
        </div>
      ) : (
        <span />
      )}
      <Field label="Урон" hint={<FormulaPreview formula={attack.damage} />}>
        <Input value={attack.damage} onChange={(e) => set("damage", e.target.value)} placeholder="1d8, 2к6 + 2" className="font-mono" />
      </Field>
      <Field label="Тип урона">
        <Input value={attack.damageType} onChange={(e) => set("damageType", e.target.value)} list={DAMAGE_LIST_ID} placeholder="Рубящий" />
      </Field>
      <Field label="Дистанция">
        <Input value={attack.range} onChange={(e) => set("range", e.target.value)} placeholder="5 фт., 80/320 фт." />
      </Field>
      <div className="flex flex-col justify-end gap-2 pb-1">
        {attack.kind === "attack" && <Checkbox checked={attack.proficient} onChange={(e) => set("proficient", e.target.checked)} label="Добавлять бонус мастерства" />}
        <Checkbox checked={attack.addMod} onChange={(e) => set("addMod", e.target.checked)} label="Добавлять модификатор к урону" />
      </div>
      <Field label="Примечание" className="sm:col-span-2">
        <Input value={attack.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Свойства, особые эффекты" />
      </Field>
      <DamageTypesDatalist />
    </div>
  );
}

/** Compact list of attacks with inline editors (used in item and feature dialogs). */
export function AttacksEditor({ attacks, onChange }: { attacks: Attack[]; onChange: (a: Attack[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {attacks.length === 0 && <p className="text-sm text-muted">Атаки появятся во вкладке «Бой»: когти, дыхание, особые удары оружием.</p>}
      {attacks.map((a, i) => {
        const open = openId === a.id;
        return (
          <div key={a.id} className="rounded-lg border border-line bg-panel">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => setOpenId(open ? null : a.id)}>
                {open ? <ChevronDown className="size-4 text-faint" /> : <ChevronRight className="size-4 text-faint" />}
                <span className="truncate font-medium">{a.name || "Без названия"}</span>
                {a.damage && <span className="truncate text-xs text-muted">{a.damage}</span>}
              </button>
              <Button size="icon-sm" variant="ghost" aria-label="Удалить атаку" onClick={() => onChange(attacks.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
            {open && (
              <div className="border-t border-line p-3">
                <AttackEditor attack={a} onChange={(next) => onChange(attacks.map((x, j) => (j === i ? next : x)))} />
              </div>
            )}
          </div>
        );
      })}
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const a = newAttack({ name: "Новая атака" });
            onChange([...attacks, a]);
            setOpenId(a.id);
          }}
        >
          <Plus /> Атака
        </Button>
      </div>
    </div>
  );
}

/** A row in the combat attack table with roll buttons. */
export function AttackLine({ row, onEdit }: { row: AttackRow; onEdit?: () => void }) {
  const roll = useRoll();
  const toHit = row.toHit;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="min-w-40 flex-1">
        <button type="button" onClick={onEdit} disabled={!onEdit} className="text-left font-medium hover:text-accent disabled:hover:text-text">
          {row.name || "Без названия"}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {row.source && <span>{row.source}</span>}
          {row.range && <span>· {row.range}</span>}
          {row.activation !== "action" && <Badge>{ACTIVATION_LABELS[row.activation]}</Badge>}
          {row.notes && <span className="truncate">· {row.notes}</span>}
        </div>
        {row.error && <div className="text-xs text-danger">{row.error}</div>}
      </div>
      {toHit && (
        <Tip content="Бросок атаки (Shift — преимущество, Alt — помеха)">
          <button
            type="button"
            onClick={(e) =>
              roll({
                label: `${row.name}: атака`,
                value: { n: toHit.value, dice: toHit.dice },
                d20: modeFromEvent(e) ?? statMode(toHit),
              })
            }
            className="flex h-9 min-w-14 items-center justify-center gap-1 rounded-lg border border-line bg-panel-2 px-2 font-semibold tabular-nums hover:border-accent hover:text-accent"
          >
            <Swords className="size-3.5 opacity-60" />
            {formatStat(toHit)}
          </button>
        </Tip>
      )}
      {row.saveDc !== null && (
        <span className="flex h-9 items-center rounded-lg border border-line bg-panel-2 px-2 text-sm tabular-nums">
          СЛ {row.saveDc}
          {row.saveAbility && ` ${ABILITY_LABELS[row.saveAbility].short}`}
        </span>
      )}
      {row.damageValue && (
        <Tip content="Бросок урона">
          <button
            type="button"
            onClick={() => roll({ label: `${row.name}: урон`, value: row.damageValue!, detail: row.damageType || undefined })}
            className={cn(
              "flex h-9 items-center gap-1 rounded-lg border border-line bg-panel-2 px-2.5 text-sm font-semibold tabular-nums hover:border-accent hover:text-accent",
            )}
          >
            {row.damage}
            {row.damageType && <span className="font-normal text-muted">{row.damageType}</span>}
          </button>
        </Tip>
      )}
    </div>
  );
}
