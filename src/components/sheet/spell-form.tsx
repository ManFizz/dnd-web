"use client";

import { RotateCcw } from "lucide-react";
import { ABILITIES, ABILITY_LABELS, SPELL_SCHOOLS } from "@/lib/rules/constants";
import { emptyDoc } from "@/lib/rules/richtext";
import type { SpellData } from "@/lib/rules/schema";
import { RichEditor } from "@/components/rich/editor";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { DamageTypesDatalist } from "./attacks";
import { FormulaPreview } from "./effects";

export const LEVEL_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: i === 0 ? "Заговор" : `${i} уровень` }));

export function spellLevelTitle(level: number): string {
  return level === 0 ? "Заговоры" : `${level} уровень`;
}

/**
 * Form for spell data. With `base`, fields that differ from it are marked and
 * can be reset one by one (per-character changes of a library spell).
 */
export function SpellForm({ value, onChange, base }: { value: SpellData; onChange: (v: SpellData) => void; base?: SpellData | null }) {
  const set = <K extends keyof SpellData>(k: K, v: SpellData[K]) => onChange({ ...value, [k]: v });
  const changed = (k: keyof SpellData) => !!base && JSON.stringify(base[k]) !== JSON.stringify(value[k]);
  const reset = (k: keyof SpellData) => base && onChange({ ...value, [k]: base[k] });
  const label = (k: keyof SpellData, text: string) =>
    changed(k) ? (
      <span className="inline-flex items-center gap-1.5 text-accent">
        {text} · изменено
        <button
          type="button"
          title="Вернуть как в библиотеке"
          onClick={(e) => {
            // Inside a <label> the click would also toggle the checkbox.
            e.preventDefault();
            reset(k);
          }}
          className="hover:text-text"
        >
          <RotateCcw className="size-3" />
        </button>
      </span>
    ) : (
      text
    );
  const ring = (k: keyof SpellData) => cn(changed(k) && "border-accent");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={label("nameRu", "Название")}>
        <Input value={value.nameRu} onChange={(e) => set("nameRu", e.target.value)} className={ring("nameRu")} placeholder="Огненный шар" />
      </Field>
      <Field label={label("nameEn", "Название (англ.)")}>
        <Input value={value.nameEn} onChange={(e) => set("nameEn", e.target.value)} className={ring("nameEn")} placeholder="Fireball" />
      </Field>
      <Field label={label("level", "Уровень")}>
        <Select value={String(value.level)} onChange={(e) => set("level", Number(e.target.value))} options={LEVEL_OPTIONS} className={ring("level")} />
      </Field>
      <Field label={label("school", "Школа")}>
        <Input value={value.school} onChange={(e) => set("school", e.target.value)} list="spell-schools" className={ring("school")} placeholder="воплощение" />
        <datalist id="spell-schools">
          {SPELL_SCHOOLS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label={label("castingTime", "Время накладывания")}>
        <Input value={value.castingTime} onChange={(e) => set("castingTime", e.target.value)} className={ring("castingTime")} placeholder="1 действие" />
      </Field>
      <Field label={label("range", "Дистанция")}>
        <Input value={value.range} onChange={(e) => set("range", e.target.value)} className={ring("range")} placeholder="150 футов" />
      </Field>
      <Field label={label("components", "Компоненты")}>
        <Input value={value.components} onChange={(e) => set("components", e.target.value)} className={ring("components")} placeholder="В, С, М (шарик из гуано)" />
      </Field>
      <Field label={label("duration", "Длительность")}>
        <Input value={value.duration} onChange={(e) => set("duration", e.target.value)} className={ring("duration")} placeholder="Мгновенная" />
      </Field>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2">
        <Checkbox checked={value.concentration} onChange={(e) => set("concentration", e.target.checked)} label={label("concentration", "Концентрация")} />
        <Checkbox checked={value.ritual} onChange={(e) => set("ritual", e.target.checked)} label={label("ritual", "Ритуал")} />
      </div>
      <Field label={label("classes", "Классы")} hint="Через запятую" className="sm:col-span-2">
        <Input
          value={value.classes.join(", ")}
          onChange={(e) =>
            set(
              "classes",
              e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
          className={ring("classes")}
          placeholder="волшебник, чародей"
        />
      </Field>
      <div className="grid gap-3 rounded-lg border border-line p-3 sm:col-span-2 sm:grid-cols-4">
        <div className="text-xs text-muted sm:col-span-4">Механика для быстрых бросков (необязательно)</div>
        <Field label={label("attack", "Атака")}>
          <Select
            value={value.attack}
            onChange={(e) => set("attack", e.target.value as SpellData["attack"])}
            options={[
              { value: "", label: "Нет" },
              { value: "melee", label: "Рукопашная" },
              { value: "ranged", label: "Дальнобойная" },
            ]}
          />
        </Field>
        <Field label={label("save", "Спасбросок")}>
          <Select
            value={value.save}
            onChange={(e) => set("save", e.target.value as SpellData["save"])}
            options={[{ value: "", label: "Нет" }, ...ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a].full }))]}
          />
        </Field>
        <Field label={label("damage", "Урон / лечение")} hint={<FormulaPreview formula={value.damage} />}>
          <Input value={value.damage} onChange={(e) => set("damage", e.target.value)} className={cn("font-mono", ring("damage"))} placeholder="8d6" />
        </Field>
        <Field label={label("damageType", "Тип урона")}>
          <Input value={value.damageType} onChange={(e) => set("damageType", e.target.value)} list="damage-types" className={ring("damageType")} placeholder="Огонь" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <div className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{label("description", "Описание")}</div>
        <RichEditor value={value.description} onChange={(doc) => set("description", doc)} minHeight="12rem" />
      </div>
      <DamageTypesDatalist />
    </div>
  );
}

/** Only the fields that differ from the base: what we store as a per-character override. */
export function diffSpell(base: SpellData, value: SpellData): Partial<SpellData> | null {
  const out: Partial<SpellData> = {};
  for (const k of Object.keys(value) as (keyof SpellData)[]) {
    if (JSON.stringify(base[k]) !== JSON.stringify(value[k])) (out as Record<string, unknown>)[k] = value[k];
  }
  return Object.keys(out).length ? out : null;
}

export const blankSpell = (): SpellData => ({
  nameRu: "",
  nameEn: "",
  level: 1,
  school: "",
  ritual: false,
  concentration: false,
  castingTime: "1 действие",
  range: "",
  components: "",
  duration: "Мгновенная",
  classes: [],
  description: emptyDoc(),
  attack: "",
  save: "",
  damage: "",
  damageType: "",
});

export function SpellBadges({ data, overridden }: { data: Pick<SpellData, "concentration" | "ritual">; overridden?: boolean }) {
  return (
    <>
      {data.concentration && (
        <Badge tone="magic" title="Концентрация">
          К
        </Badge>
      )}
      {data.ritual && (
        <Badge tone="info" title="Ритуал">
          Р
        </Badge>
      )}
      {overridden && (
        <Badge tone="accent" title="Изменено для этого персонажа">
          изм.
        </Badge>
      )}
    </>
  );
}
