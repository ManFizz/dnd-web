"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { ABILITIES, ABILITY_LABELS, type Ability } from "@/lib/rules/constants";
import { applyClassPreset, classEntryFromPreset } from "@/lib/rules/presets";
import type { CharacterDoc, ClassEntry } from "@/lib/rules/schema";
import { CLASS_CASTER_TYPES } from "@/lib/rules/schema";
import { CLASS_PRESETS, findClassPreset } from "@/lib/rules/tables";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { CommitInput, Field, Select } from "@/components/ui/input";
import { Badge, Panel } from "@/components/ui/misc";
import { Menu } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { FeatureList } from "../feature-list";
import { makeEvent, useChange, useComputed, useDoc } from "../store";

const CASTER_LABELS: Record<ClassEntry["caster"], string> = {
  none: "Не заклинатель",
  full: "Полный заклинатель",
  half: "Половинный (паладин, следопыт)",
  halfUp: "Половинный, округление вверх (изобретатель)",
  third: "Треть (мистический рыцарь, ловкач)",
  pact: "Магия договора (колдун)",
};

function ClassRow({ entry, index }: { entry: ClassEntry; index: number }) {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const update = (patch: Partial<ClassEntry>, summary: string, reason = "") =>
    change(
      (d) => {
        const c = d.classes.find((x) => x.id === entry.id);
        if (c) Object.assign(c, patch);
      },
      makeEvent(patch.level !== undefined ? "level" : "edit", summary, reason),
    );
  const setLevel = async (level: number) => {
    if (level < 1 || level > 20) return;
    const up = level > entry.level;
    const reason = up
      ? await ask.text({ title: `${entry.name}: уровень ${level}`, label: "За что (необязательно)", placeholder: "Конец арки, решение мастера…", reasonSuggestions: true })
      : "";
    if (reason === null) return;
    update({ level }, `${entry.name}: уровень ${entry.level} → ${level}`, reason);
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={index === 0 ? "Класс (основной)" : "Класс"} className="min-w-40 flex-1">
          <CommitInput value={entry.name} onCommit={(name) => update({ name, preset: findClassPreset(name)?.id ?? entry.preset }, `Класс переименован: ${name}`)} />
        </Field>
        <Field label="Подкласс" className="min-w-40 flex-1">
          <CommitInput value={entry.subclass} placeholder="Школа Воплощения" onCommit={(subclass) => update({ subclass }, `${entry.name}: подкласс ${subclass}`)} />
        </Field>
        <Field label="Уровень">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={() => setLevel(entry.level - 1)} disabled={entry.level <= 1} aria-label="Понизить уровень">
              <ChevronDown />
            </Button>
            <span className="w-8 text-center font-display text-xl font-bold tabular-nums">{entry.level}</span>
            <Button size="icon" variant="outline" onClick={() => setLevel(entry.level + 1)} disabled={entry.level >= 20} aria-label="Повысить уровень">
              <ChevronUp />
            </Button>
          </div>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Кость хитов">
          <Select
            value={String(entry.hitDie)}
            onChange={(e) => update({ hitDie: Number(e.target.value) }, `${entry.name}: кость хитов к${e.target.value}`)}
            options={[6, 8, 10, 12].map((d) => ({ value: String(d), label: `к${d}` }))}
          />
        </Field>
        <Field label="Заклинательство">
          <Select
            value={entry.caster}
            onChange={(e) => update({ caster: e.target.value as ClassEntry["caster"] }, `${entry.name}: ${CASTER_LABELS[e.target.value as ClassEntry["caster"]]}`)}
            options={CLASS_CASTER_TYPES.map((c) => ({ value: c, label: CASTER_LABELS[c] }))}
          />
        </Field>
        <Field label="Характеристика заклинаний">
          <Select
            value={entry.spellAbility}
            onChange={(e) => update({ spellAbility: e.target.value as Ability | "" }, `${entry.name}: заклинательная характеристика ${e.target.value || "—"}`)}
            options={[{ value: "", label: "—" }, ...ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a].full }))]}
          />
        </Field>
      </div>
      {doc.classes.length > 1 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              const ok = await ask.confirm({ title: `Убрать класс «${entry.name}»?`, confirmLabel: "Убрать", danger: true });
              if (!ok) return;
              change(
                (d) => {
                  d.classes = d.classes.filter((c) => c.id !== entry.id);
                },
                makeEvent("level", `Убран класс «${entry.name}» (${entry.level} ур.)`),
              );
            }}
          >
            <Trash2 /> Убрать класс
          </Button>
        </div>
      )}
    </div>
  );
}

export function ClassTab() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const features = doc.features.filter((f) => f.kind === "class");
  const mainClass = doc.classes[0];
  const addClass = (presetId: string | null) => {
    const preset = presetId ? CLASS_PRESETS.find((p) => p.id === presetId) ?? null : null;
    change((d) => {
      if (preset) applyClassPreset(d as CharacterDoc, preset, { level: 1 });
      else d.classes.push(classEntryFromPreset(null, { name: "Новый класс", level: 1 }));
    }, makeEvent("level", `Добавлен класс «${preset?.name ?? "Новый класс"}»`));
  };
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            Классы <Badge tone="accent" className="font-sans">уровень персонажа {sheet.level}</Badge>
          </span>
        }
        actions={
          <Menu
            trigger={
              <Button size="sm" variant="ghost">
                <Plus /> {doc.classes.length ? "Мультикласс" : "Класс"}
              </Button>
            }
            items={[
              ...CLASS_PRESETS.map((p) => ({ label: p.name, onSelect: () => addClass(p.id) })),
              "separator" as const,
              { label: "Свой класс", onSelect: () => addClass(null) },
            ]}
          />
        }
      >
        <div className="flex flex-col gap-3">
          {doc.classes.map((c, i) => (
            <ClassRow key={c.id} entry={c} index={i} />
          ))}
          {!doc.classes.length && <p className="text-sm text-muted">Класс не выбран. Добавьте его кнопкой справа.</p>}
        </div>
      </Panel>
      <Panel title="Классовые особенности">
        <FeatureList
          features={features}
          preset={{ kind: "class", source: mainClass ? `${mainClass.name}${mainClass.subclass ? ` (${mainClass.subclass})` : ""}` : "Класс" }}
          addLabel="Классовая особенность"
          emptyTitle="Классовых особенностей нет"
          emptyText="Добавьте умения класса и подкласса: у каждого может быть описание, бонусы, атаки и число использований."
          groupByLevel
        />
      </Panel>
      <Panel title="О классе">
        <RichEditor
          value={doc.lore.class}
          debounceMs={1200}
          placeholder="Орден, наставник, путь развития, планы на подкласс…"
          onChange={(v) =>
            change((d) => {
              d.lore.class = v;
            })
          }
        />
      </Panel>
    </div>
  );
}
