"use client";

import { AlertTriangle, ArrowUpCircle, ChevronDown, ChevronUp, Flag, Plus, Trash2 } from "lucide-react";
import { ABILITIES, ABILITY_LABELS, type Ability } from "@/lib/rules/constants";
import { makeStartingClass, prerequisiteIssues } from "@/lib/rules/multiclass";
import type { ClassEntry } from "@/lib/rules/schema";
import { CLASS_CASTER_TYPES } from "@/lib/rules/schema";
import { computePact, findClassPreset, spellcasterLevel } from "@/lib/rules/tables";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { CommitInput, Field, Select } from "@/components/ui/input";
import { Badge, Panel } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useOpenDialog } from "../dialogs-context";
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
  const open = useOpenDialog();
  const lowerLevel = () => {
    if (entry.level <= 1) return;
    update({ level: entry.level - 1 }, `${entry.name}: уровень ${entry.level} → ${entry.level - 1}`);
  };
  const multi = doc.classes.length > 1;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={multi && index === 0 ? "Начальный класс" : "Класс"} className="min-w-40 flex-1">
          <CommitInput value={entry.name} onCommit={(name) => update({ name, preset: findClassPreset(name)?.id ?? entry.preset }, `Класс переименован: ${name}`)} />
        </Field>
        <Field label="Подкласс" className="min-w-40 flex-1">
          <CommitInput value={entry.subclass} placeholder="Архетип, школа, клятва…" onCommit={(subclass) => update({ subclass }, `${entry.name}: подкласс ${subclass}`)} />
        </Field>
        <Field label="Уровень">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={lowerLevel} disabled={entry.level <= 1} aria-label="Понизить уровень">
              <ChevronDown />
            </Button>
            <span className="w-8 text-center font-display text-xl font-bold tabular-nums">{entry.level}</span>
            <Tip content="Повысить уровень: покажет, что изменится">
              <Button
                size="icon"
                variant="outline"
                onClick={() => open({ kind: "level-up", classId: entry.id })}
                disabled={entry.level >= 20}
                aria-label="Повысить уровень"
              >
                <ChevronUp />
              </Button>
            </Tip>
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
      {multi && (
        <div className="flex flex-wrap justify-end gap-1">
          {index > 0 && (
            <Tip content="Начальный класс даёт максимум кости хитов на 1 уровне. Спасброски и владения при этом не меняются.">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  change(
                    (d) => {
                      makeStartingClass(d, entry.id);
                    },
                    makeEvent("level", `Начальный класс: «${entry.name}»`),
                  )
                }
              >
                <Flag /> Сделать начальным
              </Button>
            </Tip>
          )}
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

function MulticlassSummary() {
  const doc = useDoc();
  const sheet = useComputed();
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].score.value])) as Record<Ability, number>;
  const issues = prerequisiteIssues(scores, doc.classes.map((c) => c.preset).filter(Boolean), doc.settings.edition);
  const casters = doc.classes.filter((c) => c.caster !== "none" && c.caster !== "pact");
  const pact = computePact(doc.classes);
  const rows: [string, React.ReactNode][] = [
    ["Уровни", doc.classes.map((c) => `${c.name || "Класс"} ${c.level}`).join(" / ")],
    ["Кости хитов", sheet.hitDice.map((h) => `${h.total}к${h.die}`).join(" + ")],
  ];
  if (casters.length > 1) rows.push(["Ячейки заклинаний", `как у заклинателя ${spellcasterLevel(doc.classes)} уровня (общая таблица мультикласса)`]);
  if (pact.count > 0 && casters.length > 0) rows.push(["Ячейки договора", `отдельно: ${pact.count} × ${pact.level} ур., восстанавливаются на коротком отдыхе`]);
  if (sheet.spell.byClass.length > 1)
    rows.push([
      "Заклинания",
      sheet.spell.byClass.map((c) => `${c.name}: СЛ ${c.dc.value}, атака ${c.attack.value >= 0 ? "+" : ""}${c.attack.value}`).join(" · "),
    ]);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {issues.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-2 text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            Требования мультикласса не выполнены: {issues.join("; ")}. Если мастер разрешил, ничего делать не нужно.
          </div>
        </div>
      )}
    </div>
  );
}

export function ClassTab() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const open = useOpenDialog();
  const features = doc.features.filter((f) => f.kind === "class");
  const mainClass = doc.classes[0];
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            Классы <Badge tone="accent" className="font-sans">уровень персонажа {sheet.level}</Badge>
          </span>
        }
        actions={
          <>
            {doc.classes.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => open({ kind: "level-up" })} disabled={sheet.level >= 20}>
                <ArrowUpCircle /> Повысить уровень
              </Button>
            )}
            <Tip content={doc.classes.length ? "Взять уровень в другом классе: требования и владения по правилам мультикласса" : undefined}>
              <Button size="sm" variant="ghost" onClick={() => open({ kind: "add-class" })} disabled={sheet.level >= 20}>
                <Plus /> {doc.classes.length ? "Мультикласс" : "Класс"}
              </Button>
            </Tip>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {doc.classes.map((c, i) => (
            <ClassRow key={c.id} entry={c} index={i} />
          ))}
          {doc.classes.length > 1 && <MulticlassSummary />}
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
