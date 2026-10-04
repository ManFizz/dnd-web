"use client";

import { BookOpen, Library, Lock, Pencil, Plus, Search, Sparkles, Wand2, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { ABILITIES, ABILITY_LABELS } from "@/lib/rules/constants";
import { formatStat } from "@/lib/rules/compute";
import { formatValue, hasDice } from "@/lib/rules/formula";
import type { CharacterSpell, SpellData } from "@/lib/rules/schema";
import { resolveCharacterSpell, SOURCE_LABELS } from "@/lib/spells";
import { RichEditor } from "@/components/rich/editor";
import { RichView } from "@/components/rich/view";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Badge, Empty, Panel, Pips, Segmented } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { modeFromEvent, statMode, useRoll } from "../dice";
import { useOpenDialog } from "../dialogs-context";
import { SpellBadges, spellLevelTitle } from "../spell-form";
import { StatPopover } from "../stat";
import { makeEvent, useChange, useComputed, useDoc, useSheet } from "../store";

export function SlotsEditor({ compact }: { compact?: boolean }) {
  const sheet = useComputed();
  const doc = useDoc();
  const change = useChange();
  const levels = Array.from({ length: 9 }, (_, i) => i + 1).filter((l) => sheet.spell.slots[l] > 0);
  const pact = sheet.spell.pact;
  if (!levels.length && !pact.count) {
    return compact ? null : <p className="text-sm text-muted">Ячеек нет. Их даёт класс-заклинатель; можно задать вручную ниже.</p>;
  }
  return (
    <div className={cn("grid gap-x-6 gap-y-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
      {levels.map((l) => {
        const total = sheet.spell.slots[l];
        const used = Math.min(total, doc.spellcasting.slotsUsed[l] ?? 0);
        return (
          <div key={l} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-xs font-semibold text-muted">{l} ур.</span>
            <Pips
              total={total}
              available={total - used}
              tone="magic"
              label={`Ячейки ${l} уровня`}
              onChange={(avail) =>
                change(
                  (d) => {
                    d.spellcasting.slotsUsed[l] = total - avail;
                  },
                  makeEvent("slot", `Ячейки ${l} ур.: осталось ${avail} из ${total}`),
                )
              }
            />
            <span className="text-xs text-faint tabular-nums">
              {total - used}/{total}
            </span>
          </div>
        );
      })}
      {pact.count > 0 && (
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs font-semibold text-muted">Договор</span>
          <Pips
            total={pact.count}
            available={pact.count - Math.min(pact.count, doc.spellcasting.pactUsed)}
            tone="accent"
            label="Ячейки договора"
            onChange={(avail) =>
              change(
                (d) => {
                  d.spellcasting.pactUsed = pact.count - avail;
                },
                makeEvent("slot", `Ячейки договора: осталось ${avail} из ${pact.count}`),
              )
            }
          />
          <span className="text-xs text-faint">{pact.level} ур.</span>
        </div>
      )}
    </div>
  );
}

function SlotSettings() {
  const doc = useDoc();
  const change = useChange();
  const sc = doc.spellcasting;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">Количество ячеек</span>
        <Segmented
          size="sm"
          value={sc.slotsMode}
          onChange={(mode) =>
            change(
              (d) => {
                d.spellcasting.slotsMode = mode;
              },
              makeEvent("settings", mode === "auto" ? "Ячейки считаются по классам" : "Ячейки заданы вручную"),
            )
          }
          options={[
            { value: "auto", label: "По классам" },
            { value: "manual", label: "Вручную" },
          ]}
        />
      </div>
      {sc.slotsMode === "manual" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-9">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((l) => (
            <Field key={l} label={`${l} ур.`}>
              <NumberInput
                value={sc.manualSlots[l] ?? 0}
                min={0}
                max={20}
                onCommit={(v) =>
                  change(
                    (d) => {
                      d.spellcasting.manualSlots[l] = v;
                    },
                    makeEvent("settings", `Ячейки ${l} ур. вручную: ${v}`),
                  )
                }
              />
            </Field>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Отдельные ячейки можно добавить бонусом: «Ячейки N уровня» во вкладке «Бонусы» или в эффектах предмета.</p>
    </div>
  );
}

function componentsShort(c: string): string {
  const head = c.split("(")[0];
  return head.replace(/\s+/g, " ").trim();
}

type Row = { entry: CharacterSpell; data: SpellData | null; missing: boolean; overridden: boolean };

function SpellRow({ row }: { row: Row }) {
  const { entry, data } = row;
  const [open, setOpen] = useState(false);
  const sheet = useComputed();
  const doc = useDoc();
  const change = useChange();
  const roll = useRoll();
  const openDialog = useOpenDialog();
  const library = useSheet((s) => s.library);
  const lib = entry.spellId ? library[entry.spellId] : undefined;
  const name = data?.nameRu || entry.name || "Заклинание";
  const level = data?.level ?? entry.level;
  const concentrating = doc.combat.concentration?.spellEntryId === entry.id;
  const damage = data?.damage ? sheet.calc.evaluate(data.damage) : null;

  const togglePrepared = () =>
    change((d) => {
      const e = d.spellcasting.spells.find((s) => s.id === entry.id);
      if (e) e.prepared = !e.prepared;
    });

  const castCantrip = () => {
    if (!data?.concentration) return;
    const current = doc.combat.concentration;
    change(
      (d) => {
        d.combat.concentration = { name, spellEntryId: entry.id, startedAt: new Date().toISOString(), note: "" };
      },
      makeEvent("concentration", `Концентрация: «${name}»${current ? `, прервана «${current.name}»` : ""}`),
    );
  };

  return (
    <div className={cn("border-b border-line last:border-b-0", concentrating && "bg-magic-soft")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
        {level > 0 ? (
          entry.alwaysPrepared ? (
            <Tip content="Всегда подготовлено">
              <Lock className="size-4 shrink-0 text-accent" />
            </Tip>
          ) : (
            <Tip content={entry.prepared ? "Подготовлено" : "Не подготовлено"}>
              <button
                type="button"
                onClick={togglePrepared}
                aria-pressed={entry.prepared}
                aria-label="Подготовлено"
                className={cn("size-4 shrink-0 rounded-full border-2", entry.prepared ? "border-accent bg-accent" : "border-line-strong hover:border-muted")}
              />
            </Tip>
          )
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <button type="button" onClick={() => setOpen(!open)} className="min-w-40 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("font-medium", row.missing && "text-danger")}>{name}</span>
            {data && <SpellBadges data={data} overridden={row.overridden} />}
            {!entry.spellId && <Badge>своё</Badge>}
            {entry.inBook && (
              <Tip content="В книге заклинаний">
                <BookOpen className="size-3.5 text-faint" />
              </Tip>
            )}
            {concentrating && <Badge tone="magic">концентрация</Badge>}
          </div>
          {data && (
            <div className="truncate text-xs text-muted">
              {[data.castingTime, data.range, componentsShort(data.components), data.duration].filter(Boolean).join(" · ")}
            </div>
          )}
          {row.missing && <div className="text-xs text-danger">Нет в библиотеке</div>}
        </button>
        <div className="flex items-center gap-1.5">
          {data?.attack && (
            <Tip content="Атака заклинанием (Shift — преимущество, Alt — помеха)">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) =>
                  roll({
                    label: `${name}: атака`,
                    value: { n: sheet.spell.attack.value, dice: sheet.spell.attack.dice },
                    d20: modeFromEvent(e) ?? statMode(sheet.spell.attack),
                  })
                }
              >
                {formatStat(sheet.spell.attack)}
              </Button>
            </Tip>
          )}
          {data?.save && (
            <span className="rounded-lg border border-line px-2 py-1 text-xs tabular-nums">
              СЛ {sheet.spell.dc.value} {ABILITY_LABELS[data.save].short}
            </span>
          )}
          {damage?.ok && (
            <Tip content={data?.damageType ? `Урон: ${data.damageType}` : "Бросок"}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => roll({ label: `${name}: ${data?.damageType || "урон"}`, value: damage.value })}
                disabled={!hasDice(damage.value) && damage.value.n === 0}
              >
                {formatValue(damage.value)}
              </Button>
            </Tip>
          )}
          {level > 0 ? (
            <Button size="sm" variant="subtle" onClick={() => openDialog({ kind: "cast", entryId: entry.id })} disabled={!data}>
              <WandSparkles /> <span className="hidden sm:inline">Сотворить</span>
            </Button>
          ) : (
            data?.concentration && (
              <Button size="sm" variant="subtle" onClick={castCantrip}>
                <WandSparkles /> <span className="hidden sm:inline">Сотворить</span>
              </Button>
            )
          )}
          <Button size="icon-sm" variant="ghost" onClick={() => openDialog({ kind: "spell-entry", entryId: entry.id })} aria-label="Изменить">
            <Pencil />
          </Button>
        </div>
      </div>
      {open && data && (
        <div className="px-4 pb-4 sm:pl-9">
          <div className="mb-3 grid gap-x-6 gap-y-1 rounded-lg bg-panel-2 p-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted">Уровень: </span>
              {level === 0 ? "заговор" : level}
              {data.school && `, ${data.school}`}
            </div>
            <div>
              <span className="text-muted">Время: </span>
              {data.castingTime || "—"}
            </div>
            <div>
              <span className="text-muted">Дистанция: </span>
              {data.range || "—"}
            </div>
            <div>
              <span className="text-muted">Длительность: </span>
              {data.duration || "—"}
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted">Компоненты: </span>
              {data.components || "—"}
            </div>
            {data.classes.length > 0 && (
              <div className="sm:col-span-2">
                <span className="text-muted">Классы: </span>
                {data.classes.join(", ")}
              </div>
            )}
            {(entry.source || lib) && (
              <div className="sm:col-span-2">
                <span className="text-muted">Источник: </span>
                {[entry.source, lib && (SOURCE_LABELS[lib.source] ?? lib.source), lib?.sourceBook].filter(Boolean).join(" · ")}
                {lib?.url && (
                  <a href={lib.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-info hover:underline">
                    открыть
                  </a>
                )}
              </div>
            )}
          </div>
          <RichView doc={data.description} label={name} empty={<p className="text-sm text-faint">Описания нет.</p>} />
          {entry.notes && <p className="mt-3 rounded-lg border border-line p-2 text-sm whitespace-pre-wrap text-muted">{entry.notes}</p>}
        </div>
      )}
    </div>
  );
}

export function SpellsTab() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const library = useSheet((s) => s.library);
  const openDialog = useOpenDialog();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "prepared" | "book">("all");
  const [showSettings, setShowSettings] = useState(false);

  const rows = useMemo(() => {
    const map = new Map(Object.entries(library));
    return doc.spellcasting.spells.map((entry): Row => {
      const r = resolveCharacterSpell(entry, map);
      return { entry, data: r.data, missing: r.missing && !!entry.spellId && Object.keys(library).length > 0, overridden: r.overridden.length > 0 };
    });
  }, [doc.spellcasting.spells, library]);

  const query = q.trim().toLowerCase();
  const visible = rows.filter((r) => {
    const level = r.data?.level ?? r.entry.level;
    if (filter === "prepared" && level > 0 && !r.entry.prepared && !r.entry.alwaysPrepared) return false;
    if (filter === "book" && !r.entry.inBook) return false;
    if (!query) return true;
    return [r.data?.nameRu, r.data?.nameEn, r.entry.name].some((n) => n?.toLowerCase().includes(query));
  });
  const groups = new Map<number, Row[]>();
  for (const r of visible) {
    const level = r.data?.level ?? r.entry.level;
    groups.set(level, [...(groups.get(level) ?? []), r]);
  }
  const levels = [...groups.keys()].sort((a, b) => a - b);
  const preparedCount = rows.filter((r) => (r.data?.level ?? r.entry.level) > 0 && (r.entry.prepared || r.entry.alwaysPrepared)).length;
  const unresolved = doc.meta.unresolvedSpells.length;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Заклинательство"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? "Скрыть настройки" : "Настроить"}
          </Button>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <Field label="Характеристика">
            <Select
              value={doc.spellcasting.ability}
              onChange={(e) =>
                change(
                  (d) => {
                    d.spellcasting.ability = e.target.value as typeof d.spellcasting.ability;
                  },
                  makeEvent("settings", `Заклинательная характеристика: ${e.target.value === "auto" ? "по классу" : ABILITY_LABELS[e.target.value as (typeof ABILITIES)[number]].full}`),
                )
              }
              options={[
                { value: "auto", label: `По классу: ${ABILITY_LABELS[sheet.spell.ability].short}` },
                ...ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a].full })),
              ]}
              className="w-48"
            />
          </Field>
          <StatPopover
            title="Сложность спасброска заклинаний"
            stat={sheet.spell.dc}
            signed={false}
            trigger={
              <button type="button" className="flex flex-col items-center rounded-xl border border-line bg-panel-2 px-4 py-1.5 hover:border-accent">
                <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">СЛ</span>
                <span className="font-display text-2xl font-bold tabular-nums">{sheet.spell.dc.value}</span>
              </button>
            }
          />
          <StatPopover
            title="Бонус атаки заклинанием"
            stat={sheet.spell.attack}
            rollLabel="Атака заклинанием"
            trigger={
              <button type="button" className="flex flex-col items-center rounded-xl border border-line bg-panel-2 px-4 py-1.5 hover:border-accent">
                <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">Атака</span>
                <span className="font-display text-2xl font-bold tabular-nums">{formatStat(sheet.spell.attack)}</span>
              </button>
            }
          />
          <StatPopover
            title="Модификатор заклинаний"
            stat={sheet.spell.mod}
            trigger={
              <button type="button" className="flex flex-col items-center rounded-xl border border-line bg-panel-2 px-4 py-1.5 hover:border-accent">
                <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">Мод.</span>
                <span className="font-display text-2xl font-bold tabular-nums">{formatStat(sheet.spell.mod)}</span>
              </button>
            }
          />
          <div className="text-sm text-muted">
            Подготовлено: <span className="font-semibold text-text">{preparedCount}</span>
          </div>
        </div>
        <SlotsEditor />
        {showSettings && (
          <div className="mt-4">
            <SlotSettings />
          </div>
        )}
      </Panel>

      {unresolved > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold">Из импорта осталось {unresolved} нераспознанных заклинаний.</span> Вставьте их названия, и мы найдём их в библиотеке.
          </div>
          <Button size="sm" variant="primary" onClick={() => openDialog({ kind: "spell-match" })}>
            <Wand2 /> Сопоставить
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти в списке" className="pl-9" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Все" },
            { value: "prepared", label: "Подготовленные" },
            { value: "book", label: "Книга" },
          ]}
        />
        <Button variant="primary" onClick={() => openDialog({ kind: "spell-library" })}>
          <Library /> Из библиотеки
        </Button>
        <Button variant="outline" onClick={() => openDialog({ kind: "spell-custom" })}>
          <Plus /> Своё
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty icon={<Sparkles />} title="Заклинаний пока нет">
          Добавьте их из библиотеки (заклинания с dnd.su) или создайте своё. Любое заклинание можно изменить только для этого персонажа.
        </Empty>
      ) : visible.length === 0 ? (
        <Empty title="Ничего не нашлось" />
      ) : (
        levels.map((level) => {
          const total = sheet.spell.slots[level] ?? 0;
          const used = doc.spellcasting.slotsUsed[level] ?? 0;
          return (
            <Panel
              key={level}
              title={spellLevelTitle(level)}
              bodyClassName="p-0"
              actions={level > 0 && total > 0 ? <span className="text-xs text-muted tabular-nums">ячейки {Math.max(0, total - used)}/{total}</span> : undefined}
            >
              {groups
                .get(level)!
                .sort((a, b) => (a.data?.nameRu ?? a.entry.name).localeCompare(b.data?.nameRu ?? b.entry.name, "ru"))
                .map((r) => (
                  <SpellRow key={r.entry.id} row={r} />
                ))}
            </Panel>
          );
        })
      )}
      <Panel title="Заметки о заклинаниях">
        <SpellNotes />
      </Panel>
    </div>
  );
}

function SpellNotes() {
  const doc = useDoc();
  const change = useChange();
  return (
    <LazyEditor
      value={doc.spellcasting.notes}
      onChange={(notes) =>
        change((d) => {
          d.spellcasting.notes = notes;
        })
      }
    />
  );
}

function LazyEditor(props: React.ComponentProps<typeof RichEditor>) {
  return <RichEditor debounceMs={1200} placeholder="Тактика, ритуалы, компоненты…" {...props} />;
}
