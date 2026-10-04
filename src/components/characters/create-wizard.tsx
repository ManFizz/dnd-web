"use client";

import { ArrowLeft, ArrowRight, Check, Dices, Loader2, Minus, Plus, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
  boostBonuses,
  buildCharacter,
  choicesSummary,
  pointBuyCost,
  racialBonuses,
  rollAbilityScore,
  type BoostMode,
  type CharacterChoices,
} from "@/lib/rules/builder";
import { computeSheet } from "@/lib/rules/compute";
import { ABILITIES, ABILITY_LABELS, SIZE_LABELS, SKILLS, SKILL_IDS, abilityMod, formatMod, type Ability, type SkillId } from "@/lib/rules/constants";
import { BACKGROUND_PRESETS, CLASS_PRESETS, POINT_BUY_BUDGET, POINT_BUY_COST, RACE_PRESETS, STANDARD_ARRAY } from "@/lib/rules/tables";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select, Switch } from "@/components/ui/input";
import { Badge, Segmented } from "@/components/ui/misc";

const STEPS = ["Основа", "Раса", "Класс", "Предыстория", "Характеристики", "Итог"];

type Method = "standard" | "pointbuy" | "roll" | "manual";

const METHOD_HINTS: Record<Method, string> = {
  standard: "Шесть чисел 15, 14, 13, 12, 10, 8: каждое используется один раз.",
  pointbuy: `${POINT_BUY_BUDGET} очков на значения от 8 до 15.`,
  roll: "Шесть раз 4к6, самый низкий куб отбрасывается. Затем расставьте результаты.",
  manual: "Любые значения: например, если мастер выдал характеристики сам.",
};

/** Which abilities matter most for each class, used for automatic placement. */
const CLASS_PRIORITY: Record<string, Ability[]> = {
  artificer: ["int", "con", "dex", "wis", "str", "cha"],
  barbarian: ["str", "con", "dex", "wis", "cha", "int"],
  bard: ["cha", "dex", "con", "wis", "int", "str"],
  cleric: ["wis", "con", "str", "dex", "cha", "int"],
  druid: ["wis", "con", "dex", "int", "cha", "str"],
  fighter: ["str", "con", "dex", "wis", "cha", "int"],
  monk: ["dex", "wis", "con", "str", "int", "cha"],
  paladin: ["str", "cha", "con", "wis", "dex", "int"],
  ranger: ["dex", "wis", "con", "str", "int", "cha"],
  rogue: ["dex", "int", "con", "wis", "cha", "str"],
  sorcerer: ["cha", "con", "dex", "wis", "int", "str"],
  warlock: ["cha", "con", "dex", "wis", "int", "str"],
  wizard: ["int", "con", "dex", "wis", "cha", "str"],
};

const emptyAssign = (): Record<Ability, number | null> => ({ str: null, dex: null, con: null, int: null, wis: null, cha: null });
const fill = (n: number): Record<Ability, number> => ({ str: n, dex: n, con: n, int: n, wis: n, cha: n });

const bonusText = (b: Partial<Record<Ability, number>>) =>
  (Object.entries(b) as [Ability, number][])
    .filter(([, n]) => n)
    .map(([a, n]) => `${ABILITY_LABELS[a].short} +${n}`)
    .join(", ");

function Card({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border bg-panel p-3 text-left transition-colors",
        selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [edition, setEdition] = useState<"2014" | "2024">("2014");
  const [requireReasons, setRequireReasons] = useState(true);

  const [raceId, setRaceId] = useState("human");
  const [raceName, setRaceName] = useState("");

  const [classId, setClassId] = useState("fighter");
  const [className, setClassName] = useState("");
  const [hitDie, setHitDie] = useState(8);
  const [level, setLevel] = useState(1);
  const [subclass, setSubclass] = useState("");
  const [classSkills, setClassSkills] = useState<SkillId[]>([]);

  const [bgId, setBgId] = useState("custom");
  const [bgName, setBgName] = useState("");

  const [method, setMethod] = useState<Method>("standard");
  const [assign, setAssign] = useState({ standard: emptyAssign(), roll: emptyAssign() });
  const [rolled, setRolled] = useState<number[] | null>(null);
  const [pointbuy, setPointbuy] = useState(fill(8));
  const [manual, setManual] = useState(fill(10));
  const [boostMode, setBoostMode] = useState<BoostMode>("none");
  const [boostAbilities, setBoostAbilities] = useState<Ability[]>([]);

  const race = RACE_PRESETS.find((r) => r.id === raceId) ?? null;
  const cls = CLASS_PRESETS.find((c) => c.id === classId) ?? null;
  const bg = BACKGROUND_PRESETS.find((b) => b.id === bgId) ?? null;
  const skillLimit = cls ? cls.skillChoices.count : 4;
  const skillPool: SkillId[] = cls && cls.skillChoices.from !== "any" ? cls.skillChoices.from : SKILL_IDS;

  const pool = method === "standard" ? STANDARD_ARRAY : method === "roll" ? (rolled ?? []) : [];
  const baseScores = useMemo((): Record<Ability, number> | null => {
    if (method === "pointbuy") return pointbuy;
    if (method === "manual") return manual;
    const a = assign[method];
    const values = method === "standard" ? STANDARD_ARRAY : (rolled ?? []);
    const out = fill(10);
    for (const ab of ABILITIES) {
      const idx = a[ab];
      if (idx === null || values[idx] === undefined) return null;
      out[ab] = values[idx];
    }
    return out;
  }, [method, pointbuy, manual, assign, rolled]);

  const racial = racialBonuses(edition, race?.id ?? null);
  const boosts = boostBonuses({ mode: boostMode, abilities: boostAbilities });
  const boostNeeded = boostMode === "2-1" ? 2 : boostMode === "1-1-1" ? 3 : 0;
  const boostOk = boostMode === "none" || (new Set(boostAbilities.slice(0, boostNeeded)).size === boostNeeded && boostAbilities.length >= boostNeeded);
  const spent = method === "pointbuy" ? pointBuyCost(pointbuy) : 0;

  const choices: CharacterChoices | null = baseScores
    ? {
        name,
        edition,
        requireReasons,
        race: { presetId: race?.id ?? null, name: raceName },
        cls: { presetId: cls?.id ?? null, name: className, hitDie, level, subclass, skills: classSkills },
        background: { presetId: bg?.id ?? null, name: bgName },
        scores: baseScores,
        boost: { mode: boostMode, abilities: boostAbilities },
      }
    : null;

  const errors: (string | null)[] = [
    name.trim() ? null : "Введите имя персонажа",
    raceId === "custom" && !raceName.trim() ? "Введите название расы" : null,
    classId === "custom" && !className.trim() ? "Введите название класса" : null,
    null,
    !baseScores
      ? "Расставьте все характеристики"
      : method === "pointbuy" && spent > POINT_BUY_BUDGET
        ? "Потрачено больше очков, чем есть"
        : !boostOk
          ? "Выберите разные характеристики для увеличения"
          : null,
    null,
  ];
  const firstError = errors.findIndex((e) => e);
  const canOpen = (i: number) => firstError === -1 || i <= firstError;

  const setEditionAndBoost = (e: "2014" | "2024") => {
    setEdition(e);
    // 2024 backgrounds give +2/+1 (or +1/+1/+1); 2014 races have fixed increases.
    setBoostMode(e === "2024" ? "2-1" : "none");
    setBoostAbilities([]);
  };

  const chooseClass = (id: string) => {
    setClassId(id);
    setClassSkills([]);
    const p = CLASS_PRESETS.find((c) => c.id === id);
    if (p) setHitDie(p.hitDie);
  };

  const toggleSkill = (s: SkillId, on: boolean) =>
    setClassSkills((cur) => (on ? (cur.length >= skillLimit && classId !== "custom" ? cur : [...cur, s]) : cur.filter((x) => x !== s)));

  const autoAssign = () => {
    const values = method === "standard" ? STANDARD_ARRAY : (rolled ?? []);
    if (values.length < 6) return;
    const order = CLASS_PRIORITY[classId] ?? ["str", "dex", "con", "int", "wis", "cha"];
    const byValue = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const next = emptyAssign();
    order.forEach((ab, k) => (next[ab] = byValue[k].i));
    setAssign((s) => ({ ...s, [method]: next }));
  };

  const roll = () => {
    setRolled(Array.from({ length: 6 }, () => rollAbilityScore()));
    setAssign((s) => ({ ...s, roll: emptyAssign() }));
  };

  const create = async () => {
    if (!choices || firstError !== -1) return;
    setBusy(true);
    try {
      const doc = buildCharacter(choices);
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc, events: [{ kind: "create", summary: `Создан персонаж: ${[doc.name, choicesSummary(choices)].filter(Boolean).join(", ")}` }] }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Ошибка ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      router.push(`/characters/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать персонажа");
      setBusy(false);
    }
  };

  const next = () => {
    if (errors[step]) return toast.error(errors[step]);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold">Новый персонаж</h1>
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                disabled={!canOpen(i)}
                onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-40",
                  i === step ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-text",
                )}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-panel-3 text-xs tabular-nums">
                  {i < step && !errors[i] ? <Check className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
          <Field label="Имя персонажа" required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Элара" maxLength={200} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">Редакция правил</span>
            <Segmented
              value={edition}
              onChange={setEditionAndBoost}
              options={[
                { value: "2014", label: "5e (2014)" },
                { value: "2024", label: "5e (2024)" },
              ]}
            />
            <span className="text-xs text-faint">
              {edition === "2014" ? "Увеличения характеристик даёт раса." : "Увеличения характеристик даёт предыстория, у видов их нет."}
            </span>
          </div>
          <Switch
            checked={requireReasons}
            onCheckedChange={setRequireReasons}
            label="Спрашивать, за что получено (золото, предметы, бонусы, ручные значения)"
          />
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {RACE_PRESETS.map((r) => (
              <Card key={r.id} selected={raceId === r.id} onClick={() => setRaceId(r.id)}>
                <span className="font-display text-lg font-bold">{r.name}</span>
                <span className="text-xs text-muted">
                  {SIZE_LABELS[r.size]}, скорость {r.speed} фт.{r.darkvision ? `, тёмное зрение ${r.darkvision} фт.` : ""}
                </span>
                <span className="text-xs text-accent">{edition === "2014" ? bonusText(r.abilities) : "Увеличения от предыстории"}</span>
                {r.traits.length > 0 && <span className="line-clamp-2 text-xs text-faint">{r.traits.map((t) => t.name).join(" · ")}</span>}
              </Card>
            ))}
            <Card selected={raceId === "custom"} onClick={() => setRaceId("custom")}>
              <span className="font-display text-lg font-bold">Другая раса</span>
              <span className="text-xs text-muted">Любая раса из книг или придуманная мастером. Особенности можно добавить на вкладке «Раса».</span>
            </Card>
          </div>
          {raceId === "custom" && (
            <Field label="Название расы" required>
              <Input autoFocus value={raceName} onChange={(e) => setRaceName(e.target.value)} placeholder="Проклятокровый, кенку, табакси…" maxLength={100} />
            </Field>
          )}
          {race && race.traits.length > 0 && (
            <div className="rounded-xl border border-line bg-panel p-4">
              <h3 className="mb-2 font-semibold">Особенности: {race.name}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {race.traits.map((t) => (
                  <li key={t.name}>
                    <span className="font-medium">{t.name}.</span> <span className="text-muted">{t.text}</span>
                  </li>
                ))}
                {race.languages.length > 0 && (
                  <li>
                    <span className="font-medium">Языки.</span> <span className="text-muted">{race.languages.join(", ")}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CLASS_PRESETS.map((c) => (
              <Card key={c.id} selected={classId === c.id} onClick={() => chooseClass(c.id)}>
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-display text-lg font-bold">{c.name}</span>
                  {c.caster !== "none" && <Sparkles className="size-4 text-magic" />}
                </span>
                <span className="text-xs text-muted">
                  к{c.hitDie} · спасброски {c.saves.map((a) => ABILITY_LABELS[a].short).join(", ")}
                </span>
              </Card>
            ))}
            <Card selected={classId === "custom"} onClick={() => chooseClass("custom")}>
              <span className="font-display text-lg font-bold">Другой класс</span>
              <span className="text-xs text-muted">Хоумбрю или класс не из списка</span>
            </Card>
          </div>
          <div className="grid gap-4 rounded-xl border border-line bg-panel p-4 sm:grid-cols-3">
            {classId === "custom" && (
              <>
                <Field label="Название класса" required className="sm:col-span-2">
                  <Input autoFocus value={className} onChange={(e) => setClassName(e.target.value)} maxLength={100} />
                </Field>
                <Field label="Кость хитов">
                  <Segmented
                    value={String(hitDie)}
                    onChange={(v) => setHitDie(Number(v))}
                    options={["6", "8", "10", "12"].map((v) => ({ value: v, label: `к${v}` }))}
                  />
                </Field>
              </>
            )}
            <Field label="Уровень" hint="Хиты и ячейки посчитаются сами">
              <NumberInput value={level} onCommit={setLevel} min={1} max={20} />
            </Field>
            <Field label="Подкласс" className="sm:col-span-2" hint="Можно заполнить позже">
              <Input value={subclass} onChange={(e) => setSubclass(e.target.value)} placeholder="Школа воплощения, Путь берсерка…" maxLength={100} />
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-3">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">
                Навыки класса{" "}
                <span className={cn("normal-case", classSkills.length === skillLimit ? "text-good" : "text-faint")}>
                  {classId === "custom" ? `выбрано ${classSkills.length}` : `${classSkills.length} из ${skillLimit}`}
                </span>
              </span>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {skillPool.map((s) => (
                  <Checkbox
                    key={s}
                    checked={classSkills.includes(s)}
                    disabled={!classSkills.includes(s) && classId !== "custom" && classSkills.length >= skillLimit}
                    onChange={(e) => toggleSkill(s, e.target.checked)}
                    label={
                      <span>
                        {SKILLS[s].label} <span className="text-xs text-faint">{ABILITY_LABELS[SKILLS[s].ability as Ability].short}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
            {cls && (
              <p className="text-xs text-faint sm:col-span-3">
                Класс даст владение спасбросками ({cls.saves.map((a) => ABILITY_LABELS[a].full).join(", ")}), доспехами и оружием
                {cls.armor.length ? `: ${[...cls.armor, ...cls.weapons].join(", ").toLowerCase()}` : `: ${cls.weapons.join(", ").toLowerCase()}`}. Умения
                класса добавляются на вкладке «Класс».
              </p>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BACKGROUND_PRESETS.map((b) => {
              const overlap = b.skills.filter((s) => classSkills.includes(s));
              return (
                <Card key={b.id} selected={bgId === b.id} onClick={() => setBgId(b.id)}>
                  <span className="font-display text-lg font-bold">{b.name}</span>
                  <span className="text-xs text-muted">{b.skills.map((s) => SKILLS[s].label).join(", ")}</span>
                  {b.tools.length > 0 && <span className="text-xs text-faint">{b.tools.join(", ")}</span>}
                  {overlap.length > 0 && <span className="text-xs text-danger">Уже выбрано в классе: {overlap.map((s) => SKILLS[s].label).join(", ")}</span>}
                </Card>
              );
            })}
            <Card selected={bgId === "custom"} onClick={() => setBgId("custom")}>
              <span className="font-display text-lg font-bold">Своя или без предыстории</span>
              <span className="text-xs text-muted">Навыки и владения можно отметить прямо в листе.</span>
            </Card>
          </div>
          {bgId === "custom" && (
            <Field label="Название предыстории" hint="Можно оставить пустым">
              <Input value={bgName} onChange={(e) => setBgName(e.target.value)} maxLength={100} />
            </Field>
          )}
          {bg && bg.skills.some((s) => classSkills.includes(s)) && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              Навык совпадает с выбранным в классе. По правилам вместо него берётся любой другой.{" "}
              <button type="button" className="underline" onClick={() => setStep(2)}>
                Изменить навыки класса
              </button>
            </p>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Segmented
              value={method}
              onChange={setMethod}
              options={[
                { value: "standard", label: "Стандартный набор" },
                { value: "pointbuy", label: "Покупка очков" },
                { value: "roll", label: "4к6" },
                { value: "manual", label: "Вручную" },
              ]}
              className="flex-wrap"
            />
            <span className="text-sm text-muted">{METHOD_HINTS[method]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {method === "roll" && (
              <Button variant={rolled ? "outline" : "primary"} onClick={roll}>
                <Dices /> {rolled ? "Перебросить" : "Бросить 4к6 шесть раз"}
              </Button>
            )}
            {method === "roll" && rolled && <span className="font-display text-lg tabular-nums">{rolled.join(" · ")}</span>}
            {(method === "standard" || (method === "roll" && rolled)) && (
              <Button variant="ghost" onClick={autoAssign}>
                <Wand2 /> Расставить под класс
              </Button>
            )}
            {method === "pointbuy" && (
              <Badge tone={spent > POINT_BUY_BUDGET ? "danger" : spent === POINT_BUY_BUDGET ? "good" : "neutral"}>
                Осталось очков: {POINT_BUY_BUDGET - spent} из {POINT_BUY_BUDGET}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {ABILITIES.map((a) => {
              const used = new Set(Object.entries(assign[method === "roll" ? "roll" : "standard"]).flatMap(([k, v]) => (k !== a && v !== null ? [v] : [])));
              const base = baseScores?.[a] ?? (method === "pointbuy" ? pointbuy[a] : method === "manual" ? manual[a] : null);
              const extra = (racial[a] ?? 0) + (boosts[a] ?? 0);
              const total = base !== null ? base + extra : null;
              const idx = method === "standard" || method === "roll" ? assign[method][a] : null;
              return (
                <div key={a} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-panel p-3">
                  <span className="text-sm font-medium">{ABILITY_LABELS[a].full}</span>
                  {(method === "standard" || method === "roll") && (
                    <Select
                      value={idx === null ? "" : String(idx)}
                      onChange={(e) => setAssign((s) => ({ ...s, [method]: { ...s[method], [a]: e.target.value === "" ? null : Number(e.target.value) } }))}
                      placeholder="—"
                      disabled={method === "roll" && !rolled}
                      options={pool.map((v, i) => ({ value: String(i), label: String(v), disabled: used.has(i) }))}
                      className="w-full text-center"
                    />
                  )}
                  {method === "pointbuy" && (
                    <div className="flex items-center gap-1">
                      <Button size="icon-sm" variant="outline" aria-label="Меньше" disabled={pointbuy[a] <= 8} onClick={() => setPointbuy((p) => ({ ...p, [a]: p[a] - 1 }))}>
                        <Minus />
                      </Button>
                      <span className="w-7 text-center tabular-nums">{pointbuy[a]}</span>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label="Больше"
                        disabled={pointbuy[a] >= 15 || spent + (POINT_BUY_COST[pointbuy[a] + 1] - POINT_BUY_COST[pointbuy[a]]) > POINT_BUY_BUDGET}
                        onClick={() => setPointbuy((p) => ({ ...p, [a]: p[a] + 1 }))}
                      >
                        <Plus />
                      </Button>
                    </div>
                  )}
                  {method === "manual" && <NumberInput value={manual[a]} onCommit={(v) => setManual((m) => ({ ...m, [a]: v }))} min={1} max={30} className="w-16 text-center" />}
                  <span className="h-4 text-xs text-accent">{extra ? `+${extra}` : ""}</span>
                  <span className="font-display text-3xl font-bold tabular-nums">{total ?? "—"}</span>
                  <span className="text-sm text-muted tabular-nums">{total !== null ? formatMod(abilityMod(total)) : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Свободные увеличения</div>
                <div className="text-xs text-muted">
                  {edition === "2024" ? "Предыстория 2024 даёт +2 и +1 или +1 к трём характеристикам." : "Для своих рас и вариантов из «Котла Таши». Расовые бонусы уже учтены."}
                </div>
              </div>
              <Segmented
                value={boostMode}
                onChange={(m) => {
                  setBoostMode(m);
                  setBoostAbilities([]);
                }}
                options={[
                  { value: "none", label: "Нет" },
                  { value: "2-1", label: "+2 и +1" },
                  { value: "1-1-1", label: "+1, +1, +1" },
                ]}
              />
            </div>
            {boostNeeded > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {Array.from({ length: boostNeeded }, (_, i) => (
                  <Field key={i} label={boostMode === "2-1" ? (i === 0 ? "+2" : "+1") : "+1"}>
                    <Select
                      value={boostAbilities[i] ?? ""}
                      placeholder="Выберите"
                      onChange={(e) =>
                        setBoostAbilities((cur) => {
                          const nextAbilities = [...cur];
                          nextAbilities[i] = e.target.value as Ability;
                          return nextAbilities;
                        })
                      }
                      options={ABILITIES.map((ab) => ({
                        value: ab,
                        label: ABILITY_LABELS[ab].full,
                        disabled: boostAbilities.some((x, j) => j !== i && x === ab),
                      }))}
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {step === 5 && choices && firstError === -1 && <Review choices={choices} />}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft /> Назад
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={next}>
            Далее <ArrowRight />
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={create} disabled={busy || firstError !== -1}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Создать персонажа
          </Button>
        )}
      </div>
    </div>
  );
}

function Review({ choices }: { choices: CharacterChoices }) {
  const doc = useMemo(() => buildCharacter(choices), [choices]);
  const s = useMemo(() => computeSheet(doc), [doc]);
  const tiles = [
    { label: "КД", value: s.ac.value },
    { label: "Хиты", value: s.hpMax.value },
    { label: "Инициатива", value: formatMod(s.initiative.value) },
    { label: "Скорость", value: `${s.speed.walk.value} фт.` },
    { label: "Мастерство", value: formatMod(s.prof.value) },
    ...(s.spell.hasCasting ? [{ label: "СЛ заклинаний", value: s.spell.dc.value }] : []),
  ];
  const profSkills = SKILL_IDS.filter((id) => s.skills[id].prof > 0);
  const profs = [...s.proficiencies.armor, ...s.proficiencies.weapons, ...s.proficiencies.tools].map((p) => p.value);
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="font-display text-2xl font-bold">{doc.name}</div>
        <div className="text-sm text-muted">{[choicesSummary(choices), doc.info.background].filter(Boolean).join(" · ")}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col items-center rounded-lg bg-panel-2 px-2 py-2">
              <span className="font-display text-xl font-bold tabular-nums">{t.value}</span>
              <span className="text-xs text-muted">{t.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((a) => (
            <div key={a} className="flex flex-col items-center rounded-lg border border-line px-2 py-1.5">
              <span className="text-xs text-muted">{ABILITY_LABELS[a].short}</span>
              <span className="font-display text-lg font-bold tabular-nums">{s.abilities[a].score.value}</span>
              <span className="text-xs text-faint tabular-nums">
                спас {formatMod(s.abilities[a].save.value)}
                {s.saveProf[a] > 0 && " ●"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <h3 className="mb-1 font-semibold">Навыки</h3>
          <p className="text-muted">{profSkills.length ? profSkills.map((id) => `${SKILLS[id].label} ${formatMod(s.skills[id].stat.value)}`).join(", ") : "Нет"}</p>
          <h3 className="mt-3 mb-1 font-semibold">Владения</h3>
          <p className="text-muted">{profs.length ? profs.join(", ") : "Нет"}</p>
          <h3 className="mt-3 mb-1 font-semibold">Языки</h3>
          <p className="text-muted">{s.proficiencies.languages.map((p) => p.value).join(", ") || "Нет"}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <h3 className="mb-1 font-semibold">Особенности</h3>
          <p className="text-muted">{doc.features.map((f) => f.name).join(", ") || "Нет"}</p>
          <p className="mt-3 text-xs text-faint">
            После создания добавьте умения класса, снаряжение и заклинания в листе. Всё, что вы поменяете руками, попадёт в журнал.
          </p>
        </div>
      </div>
    </section>
  );
}
