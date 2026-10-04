"use client";

import { AlertTriangle, ArrowUpCircle, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { ABILITIES, SKILLS, formatMod, type Ability, type SkillId } from "@/lib/rules/constants";
import { Calculator } from "@/lib/rules/compute";
import { addMulticlass, applyLevelUp, levelUpSummary, multiclassRule, prerequisiteIssues, requirementText, skillOptions } from "@/lib/rules/multiclass";
import { applyClassPreset, classEntryFromPreset } from "@/lib/rules/presets";
import type { CharacterDoc } from "@/lib/rules/schema";
import { CLASS_PRESETS } from "@/lib/rules/tables";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { useOpenDialog } from "./dialogs-context";
import { makeEvent, useChange, useComputed, useDoc } from "./store";

const clone = (d: CharacterDoc) => JSON.parse(JSON.stringify(d)) as CharacterDoc;

/** Max HP of a document; current HP follows it when classes gain levels. */
function hpMaxOf(d: CharacterDoc): number {
  return new Calculator(clone(d)).value("hp.max");
}

function totalLevel(d: CharacterDoc): number {
  return d.classes.reduce((a, c) => a + c.level, 0);
}

export function AddClassDialog({ onClose }: { onClose: () => void }) {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const edition = doc.settings.edition;
  const first = doc.classes.length === 0;
  const taken = new Set(doc.classes.map((c) => c.preset).filter(Boolean));
  const [presetId, setPresetId] = useState(() => CLASS_PRESETS.find((p) => !taken.has(p.id))?.id ?? "");
  const [name, setName] = useState("");
  const [subclass, setSubclass] = useState("");
  const [level, setLevel] = useState(1);
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const [skill, setSkill] = useState<SkillId | "">("");
  const [reason, setReason] = useState("");
  const required = doc.settings.requireReasons;

  const preset = CLASS_PRESETS.find((p) => p.id === presetId) ?? null;
  const rule = preset && !first ? multiclassRule(preset.id, edition) : null;
  const remaining = 20 - totalLevel(doc);
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].score.value])) as Record<Ability, number>;
  const issues = first ? [] : prerequisiteIssues(scores, [presetId, ...doc.classes.map((c) => c.preset)].filter(Boolean), edition);
  const owned = (list: { name: string }[], n: string) => list.some((p) => p.name.toLowerCase() === n.toLowerCase());
  const profGroups = rule
    ? [
        { title: "Доспехи", items: rule.armor, have: doc.proficiencies.armor },
        { title: "Оружие", items: rule.weapons, have: doc.proficiencies.weapons },
        { title: "Инструменты", items: rule.tools, have: doc.proficiencies.tools },
      ].filter((g) => g.items.length)
    : [];
  const skills = skillOptions(preset, rule).filter((s) => doc.skills[s].prof < 1);
  const title = preset?.name ?? (name.trim() || "Свой класс");
  const lvl = Math.max(1, Math.min(remaining, level));

  const manualHp = doc.combat.hpMaxMode === "manual" && !sheet.hpMax.overridden;
  const [typedHp, setTypedHp] = useState<number | null>(null);
  const preview = (() => {
    if (remaining < 1) return null;
    const copy = clone(doc);
    const entry = classEntryFromPreset(preset, { name: title, level: lvl, edition });
    copy.classes.push(entry);
    const perLevel = Math.max(1, Math.floor(entry.hitDie / 2) + 1 + sheet.abilities.con.mod);
    const hp = manualHp ? (typedHp ?? perLevel * lvl) : Math.max(0, hpMaxOf(copy) - sheet.hpMax.value);
    return { hp, level: totalLevel(copy), die: entry.hitDie };
  })();

  const pick = (id: string) => {
    setPresetId(id);
    setUnchecked(new Set());
    setSkill("");
    setTypedHp(null);
  };

  const submit = () => {
    if (remaining < 1) return;
    const chosen = (items: string[]) => items.filter((x) => !unchecked.has(x));
    // A new class adds hit dice and hit points right away.
    const gain = preview?.hp ?? 0;
    change(
      (d) => {
        if (first && preset) applyClassPreset(d, preset, { level: lvl, subclass: subclass.trim() });
        else if (first) d.classes.push(classEntryFromPreset(null, { name: title, level: lvl, subclass: subclass.trim() }));
        else
          addMulticlass(d, {
            preset,
            name: preset ? undefined : title,
            subclass: subclass.trim(),
            level: lvl,
            armor: chosen(rule?.armor ?? []),
            weapons: chosen(rule?.weapons ?? []),
            tools: chosen(rule?.tools ?? []),
            skills: skill ? [skill] : [],
          });
        if (manualHp) d.combat.hpMaxManual += gain;
        if (gain > 0) d.combat.hpCurrent += gain;
      },
      makeEvent(
        "level",
        `${first ? `Класс «${title}»` : `Мультикласс: добавлен класс «${title}»`}, ${lvl} ур.${gain > 0 ? `, хиты +${gain}` : ""}`,
        [reason.trim(), issues.length ? `требования не выполнены: ${issues.join("; ")}` : ""].filter(Boolean).join(" · "),
      ),
    );
    toast.success(first ? `Класс «${title}» добавлен` : `Теперь у персонажа мультикласс: ${title}`);
    onClose();
  };

  return (
    <Modal
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={first ? "Класс персонажа" : "Новый класс (мультикласс)"}
      description={
        first
          ? "Начальный класс даёт спасброски, владения и максимум кости хитов на 1 уровне."
          : "Второй класс даёт только часть владений и не даёт спасбросков. Хиты за его уровни считаются по среднему значению кости."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={submit} disabled={remaining < 1 || (!preset && !name.trim()) || (required && !reason.trim())}>
            <Plus /> Добавить класс
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {remaining < 1 && <p className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger">Уровень персонажа уже 20: новый класс добавить нельзя.</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <Field label="Класс">
            <Select
              value={presetId}
              onChange={(e) => pick(e.target.value)}
              options={[
                ...CLASS_PRESETS.map((p) => ({ value: p.id, label: `${p.name}${taken.has(p.id) ? " (уже есть)" : ""}`, disabled: taken.has(p.id) })),
                { value: "", label: "Свой класс…" },
              ]}
            />
          </Field>
          <Field label="Уровень">
            <NumberInput
              value={lvl}
              min={1}
              max={Math.max(1, remaining)}
              onCommit={(v) => {
                setLevel(v);
                setTypedHp(null);
              }}
            />
          </Field>
        </div>
        {!preset && (
          <Field label="Название класса" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Кровавый охотник" />
          </Field>
        )}
        <Field label="Подкласс" hint="Можно указать позже во вкладке «Класс»">
          <Input value={subclass} onChange={(e) => setSubclass(e.target.value)} placeholder={preset?.id === "fighter" ? "Мастер боевых искусств" : "Архетип, школа, клятва…"} />
        </Field>

        {rule && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg p-2.5 text-sm",
              issues.length ? "bg-danger-soft text-danger" : "bg-good-soft text-good",
            )}
          >
            {issues.length > 0 && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            <div>
              {issues.length ? (
                <>
                  <div className="font-medium">Требования мультикласса не выполнены</div>
                  {issues.map((i) => (
                    <div key={i}>{i}</div>
                  ))}
                  <div className="mt-1 text-xs opacity-80">Добавить всё равно можно, если мастер разрешил.</div>
                </>
              ) : (
                <>Требование {requirementText(rule)} выполнено.</>
              )}
            </div>
          </div>
        )}

        {profGroups.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium tracking-wide text-muted uppercase">Владения от нового класса</div>
            {profGroups.map((g) => (
              <div key={g.title} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="w-24 text-sm text-muted">{g.title}</span>
                {g.items.map((item) =>
                  owned(g.have, item) ? (
                    <span key={item} className="text-sm text-faint">
                      {item} (уже есть)
                    </span>
                  ) : (
                    <Checkbox
                      key={item}
                      checked={!unchecked.has(item)}
                      onChange={(e) => {
                        const next = new Set(unchecked);
                        if (e.target.checked) next.delete(item);
                        else next.add(item);
                        setUnchecked(next);
                      }}
                      label={item}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
        {rule && rule.skills.count > 0 && (
          <Field label="Навык на выбор" hint={rule.skills.from === "any" ? "Любой навык" : "Из списка навыков класса"}>
            <Select
              value={skill}
              onChange={(e) => setSkill(e.target.value as SkillId | "")}
              options={[{ value: "", label: "Не выбран" }, ...skills.map((s) => ({ value: s, label: SKILLS[s].label }))]}
            />
          </Field>
        )}
        {rule && !profGroups.length && rule.skills.count === 0 && <p className="text-sm text-muted">Новых владений этот класс при мультиклассе не даёт.</p>}

        {preview && (
          <div className="flex flex-col gap-1 rounded-lg border border-line p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Уровень персонажа станет <span className="font-semibold">{preview.level}</span>
                {!manualHp && preview.hp > 0 && (
                  <>
                    , максимум хитов вырастет на <span className="font-semibold">{preview.hp}</span>
                  </>
                )}
                {manualHp ? ", максимум хитов вырастет на" : "."}
              </span>
              {manualHp && (
                <NumberInput value={preview.hp} min={0} max={400} onCommit={setTypedHp} className="h-7 w-16" aria-label="Прибавка к максимуму хитов" />
              )}
            </div>
            {manualHp && (
              <span className="text-xs text-muted">
                Максимум задан вручную. Предложено среднее к{preview.die} + Телосложение за каждый уровень; можно вписать свои броски.
              </span>
            )}
          </div>
        )}
        <Field label={required ? "За что" : "За что (необязательно)"} required={required}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Решение мастера, обучение у наставника…" />
        </Field>
      </div>
    </Modal>
  );
}

export function LevelUpDialog({ classId, onClose }: { classId?: string; onClose: () => void }) {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const open = useOpenDialog();
  const candidates = doc.classes.filter((c) => c.level < 20);
  const total = totalLevel(doc);
  const [selected, setSelected] = useState(() => (classId && candidates.some((c) => c.id === classId) ? classId : (candidates[0]?.id ?? "")));
  const [reason, setReason] = useState("");
  const required = doc.settings.requireReasons;
  const entry = doc.classes.find((c) => c.id === selected);
  const summary = entry ? levelUpSummary(doc, entry.id) : null;
  const hpAfter = (() => {
    if (!entry) return null;
    const copy = clone(doc);
    applyLevelUp(copy, entry.id, 0);
    return hpMaxOf(copy);
  })();
  const autoHp = doc.combat.hpMaxMode === "auto" && !sheet.hpMax.overridden;
  const manualHp = doc.combat.hpMaxMode === "manual" && !sheet.hpMax.overridden;
  const avg = entry ? Math.floor(entry.hitDie / 2) + 1 : 0;
  const con = sheet.abilities.con.mod;
  // A manual maximum (imports keep the original number) grows by the average or a typed roll.
  const [typedGain, setTypedGain] = useState<number | null>(null);
  const hpGain = autoHp
    ? hpAfter !== null
      ? Math.max(0, hpAfter - sheet.hpMax.value)
      : 0
    : manualHp
      ? (typedGain ?? Math.max(1, avg + con))
      : 0;
  const maxed = total >= 20;

  const submit = () => {
    if (!entry || maxed) return;
    change(
      (d) => {
        if (manualHp) d.combat.hpMaxManual += hpGain;
        applyLevelUp(d, entry.id, hpGain);
      },
      makeEvent(
        "level",
        `${entry.name}: уровень ${entry.level} → ${entry.level + 1} (персонаж ${total} → ${total + 1})${hpGain ? `, хиты +${hpGain}` : ""}`,
        reason.trim(),
      ),
    );
    toast.success(`${entry.name}: ${entry.level + 1} уровень`, {
      description: summary?.asi ? "На этом уровне класса обычно берут увеличение характеристик или черту." : undefined,
    });
    onClose();
  };

  const rows: React.ReactNode[] = [];
  if (summary && entry) {
    rows.push(
      <li key="hp">
        {autoHp ? (
          <>
            Хиты: максимум {sheet.hpMax.value} → <b>{sheet.hpMax.value + hpGain}</b>{" "}
            <span className="text-muted">
              (к{entry.hitDie} в среднем {avg}, Телосложение {formatMod(con)})
            </span>
            . Текущие хиты тоже вырастут на {hpGain}.
          </>
        ) : manualHp ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Хиты: максимум {sheet.hpMax.value} → <b>{sheet.hpMax.value + hpGain}</b>, прибавить
              </span>
              <NumberInput value={hpGain} min={0} max={99} onCommit={setTypedGain} className="h-7 w-16" aria-label="Прибавка к максимуму хитов" />
            </div>
            <span className="text-xs text-muted">
              Максимум задан вручную. Предложено среднее к{entry.hitDie} ({avg}) + Телосложение ({formatMod(con)}); можно вписать свой бросок.
            </span>
          </div>
        ) : (
          <>Максимум хитов закреплён правкой: поменяйте его сами, если нужно.</>
        )}
      </li>,
      <li key="hd">Кости хитов: +1к{summary.hitDie}</li>,
    );
    if (summary.prof[1] !== summary.prof[0]) rows.push(<li key="prof">Бонус мастерства: +{summary.prof[0]} → <b>+{summary.prof[1]}</b></li>);
    for (const s of summary.slots) rows.push(<li key={`s${s.level}`}>Ячейки {s.level} уровня: {s.before} → <b>{s.after}</b></li>);
    if (summary.pact)
      rows.push(
        <li key="pact">
          Ячейки договора: {summary.pact.before.count} × {summary.pact.before.level} ур. → <b>{summary.pact.after.count} × {summary.pact.after.level} ур.</b>
        </li>,
      );
    if (summary.cantripsGrow) rows.push(<li key="cantrip">Заговоры, урон которых растёт с уровнем персонажа, становятся сильнее.</li>);
    if (summary.asi) rows.push(<li key="asi">Увеличение характеристик или черта: добавьте его бонусом или во вкладке «Черты».</li>);
  }

  return (
    <Modal
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title="Повышение уровня"
      description={maxed ? "Уровень персонажа уже максимальный." : `Уровень персонажа ${total} → ${total + 1}. Выберите класс, который получает уровень.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={submit} disabled={!entry || maxed || (required && !reason.trim())}>
            <ArrowUpCircle /> Повысить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Класс" className="flex flex-col gap-1.5">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === selected}
              onClick={() => {
                setSelected(c.id);
                setTypedGain(null);
              }}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                c.id === selected ? "border-accent bg-accent-soft" : "border-line hover:bg-panel-2",
              )}
            >
              <span>
                <span className="font-medium">{c.name || "Класс"}</span>
                {c.subclass && <span className="text-muted"> ({c.subclass})</span>}
              </span>
              <span className="tabular-nums">
                {c.level} → <b>{c.level + 1}</b>
              </span>
            </button>
          ))}
          {!maxed && (
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                onClose();
                open({ kind: "add-class" });
              }}
            >
              <Plus /> Новый класс (мультикласс)
            </Button>
          )}
        </div>
        {rows.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Что изменится</div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">{rows}</ul>
          </div>
        )}
        <Field label={required ? "За что" : "За что (необязательно)"} required={required}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Конец арки, решение мастера…" />
        </Field>
      </div>
    </Modal>
  );
}
