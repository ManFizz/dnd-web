"use client";

import { Brain, Heart, Minus, Moon, Plus, Shield, Sparkles, Star, Sun, X, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { CONDITIONS, conditionDef, conditionLabel } from "@/lib/rules/conditions";
import { SPEED_LABELS, SPEED_TYPES } from "@/lib/rules/constants";
import { formatStat } from "@/lib/rules/compute";
import { newItem } from "@/lib/rules/defaults";
import { Button } from "@/components/ui/button";
import { Checkbox, parseNumber } from "@/components/ui/input";
import { Popover, Tip } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useOpenDialog } from "./dialogs-context";
import { useRoll, useRollStat } from "./dice";
import { StatFlags, StatPopover } from "./stat";
import { makeEvent, useChange, useComputed, useDoc, useSheetApi } from "./store";

function VitalCard({ label, short, children, className }: { label: React.ReactNode; short?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      role="group"
      aria-label={typeof label === "string" ? label : undefined}
      className={cn("flex min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-panel px-2.5 py-1.5 sm:min-w-[4.5rem]", className)}
    >
      <div className="text-[10px] font-semibold tracking-wider whitespace-nowrap text-muted uppercase sm:tracking-widest">
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="max-sm:hidden">{label}</span>
          </>
        ) : (
          label
        )}
      </div>
      {children}
    </div>
  );
}

const bigValue = "relative font-display text-2xl leading-tight font-bold tabular-nums hover:text-accent";

function ArmorClass() {
  const sheet = useComputed();
  const doc = useDoc();
  const change = useChange();
  const shields = doc.items.filter((i) => i.category === "shield");
  const shieldOn = shields.some((i) => i.equipped);
  const showShield = !doc.settings.hidden.includes("prof.shield");
  const toggleShield = () => {
    if (!shields.length) {
      const shield = newItem({ name: "Щит", category: "shield", shieldBonus: 2, weight: 6, equipped: true, cost: "10 зм" });
      change(
        (d) => {
          d.items.push(shield);
        },
        makeEvent("item", "Добавлен щит и взят в руку"),
      );
      return;
    }
    const target = shields[0];
    change(
      (d) => {
        for (const i of d.items) if (i.category === "shield") i.equipped = !shieldOn && i.id === target.id;
      },
      makeEvent("item", shieldOn ? "Щит убран" : `Взят щит «${target.name}»`),
    );
  };
  return (
    <VitalCard label="КД" className="relative">
      <StatPopover
        title="Класс доспеха"
        stat={sheet.ac}
        signed={false}
        trigger={
          <button type="button" className={bigValue}>
            {sheet.ac.value}
            <StatFlags stat={sheet.ac} />
          </button>
        }
      />
      {showShield && (
        <Tip content={shieldOn ? "Щит в руке (нажмите, чтобы убрать)" : shields.length ? "Взять щит" : "Добавить щит в снаряжение и взять"}>
          <button
            type="button"
            onClick={toggleShield}
            aria-pressed={shieldOn}
            className={cn(
              "absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-panel",
              shieldOn ? "border-accent text-accent" : "border-line text-faint hover:text-text",
            )}
          >
            <Shield className="size-3.5" />
          </button>
        </Tip>
      )}
    </VitalCard>
  );
}

function HitPoints() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const api = useSheetApi();
  const roll = useRollStat();
  const [amount, setAmount] = useState("");
  const max = sheet.hpMax.value;
  const { hpCurrent: hp, hpTemp: temp } = doc.combat;
  const n = Math.abs(Math.round(parseNumber(amount) ?? 0));

  const damage = () => {
    if (!n) return;
    const c = api.getState().doc.combat;
    const absorbed = Math.min(c.hpTemp, n);
    const after = Math.max(0, c.hpCurrent - (n - absorbed));
    change(
      (d) => {
        d.combat.hpTemp -= absorbed;
        d.combat.hpCurrent = after;
      },
      makeEvent("hp", `Урон ${n}${absorbed ? ` (временные поглотили ${absorbed})` : ""}: хиты ${c.hpCurrent} → ${after}`),
    );
    setAmount("");
    if (c.concentration) {
      const dc = Math.max(10, Math.floor(n / 2));
      toast(`Концентрация: «${c.concentration.name}»`, {
        description: `Спасбросок Телосложения, СЛ ${dc}`,
        duration: 15000,
        action: { label: "Бросить", onClick: () => roll(`Концентрация (СЛ ${dc})`, sheet.abilities.con.save) },
      });
    }
    if (after === 0 && c.hpCurrent > 0) toast.error("0 хитов: персонаж без сознания. Спасброски от смерти появились у хитов.");
  };
  const heal = () => {
    if (!n) return;
    const c = api.getState().doc.combat;
    const after = Math.min(max, c.hpCurrent + n);
    change(
      (d) => {
        d.combat.hpCurrent = after;
        if (after > 0) {
          d.combat.deathSuccesses = 0;
          d.combat.deathFailures = 0;
        }
      },
      makeEvent("hp", `Лечение ${n}: хиты ${c.hpCurrent} → ${after}`),
    );
    setAmount("");
  };
  const setTemp = () => {
    const c = api.getState().doc.combat;
    change(
      (d) => {
        d.combat.hpTemp = n;
      },
      makeEvent("hp", `Временные хиты: ${c.hpTemp} → ${n}`),
    );
    setAmount("");
  };

  const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const bar = pct > 0.5 ? "bg-good" : pct > 0.25 ? "bg-accent" : "bg-danger";
  return (
    <div className="flex min-w-[17rem] flex-1 flex-col gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 sm:flex-none">
      <div className="flex items-center gap-3">
        <Heart className={cn("size-5 shrink-0", hp === 0 ? "text-danger" : "text-danger/70")} />
        <div className="flex items-baseline gap-1 font-display tabular-nums">
          <span className="text-2xl leading-none font-bold">{hp}</span>
          <span className="text-muted">/</span>
          <StatPopover
            title="Максимум хитов"
            stat={sheet.hpMax}
            signed={false}
            bonusTarget="hp.max"
            trigger={
              <button type="button" className={cn("relative text-lg font-bold hover:text-accent", sheet.hpMax.overridden && "text-accent")}>
                {max}
              </button>
            }
          />
          {temp > 0 && <span className="ml-1 rounded-md bg-info-soft px-1.5 text-sm font-semibold text-info">+{temp}</span>}
        </div>
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            damage();
          }}
        >
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            aria-label="Сколько хитов"
            className="h-8 w-14 rounded-lg border border-line bg-panel-2 text-center text-sm tabular-nums focus:border-accent focus:outline-none"
          />
          <Tip content="Урон (Enter)">
            <Button size="icon-sm" variant="danger" type="submit" disabled={!n} aria-label="Урон">
              <Minus />
            </Button>
          </Tip>
          <Tip content="Лечение">
            <Button size="icon-sm" variant="outline" className="text-good" onClick={heal} disabled={!n} aria-label="Лечение">
              <Plus />
            </Button>
          </Tip>
          <Tip content="Временные хиты (заменяют текущие временные)">
            <Button size="icon-sm" variant="outline" className="text-info" onClick={setTemp} disabled={!amount.trim()} aria-label="Временные хиты">
              <Zap />
            </Button>
          </Tip>
        </form>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        {!doc.settings.hidden.includes("combat.hitDice") && (
          <span>
            Кости хитов:{" "}
            {sheet.hitDice.length
              ? sheet.hitDice.map((d) => (
                  <span key={d.die} className="tabular-nums">
                    {d.total - d.used}/{d.total}к{d.die}{" "}
                  </span>
                ))
              : "—"}
          </span>
        )}
        {hp === 0 && !doc.settings.hidden.includes("combat.deathSaves") && <DeathSaves />}
      </div>
    </div>
  );
}

function DeathSaves() {
  const doc = useDoc();
  const change = useChange();
  const roll = useRoll();
  const { deathSuccesses: ok, deathFailures: fail } = doc.combat;
  const set = (key: "deathSuccesses" | "deathFailures", v: number) =>
    change(
      (d) => {
        d.combat[key] = v;
      },
      makeEvent("hp", `Спасброски от смерти: ${key === "deathSuccesses" ? `успехи ${v}` : `провалы ${v}`}`),
    );
  const dots = (count: number, key: "deathSuccesses" | "deathFailures", tone: string) =>
    [0, 1, 2].map((i) => (
      <button
        key={i}
        type="button"
        onClick={() => set(key, i < count ? i : i + 1)}
        className={cn("size-3 rounded-full border", i < count ? tone : "border-line-strong")}
        aria-label={key === "deathSuccesses" ? "Успех" : "Провал"}
      />
    ));
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="text-danger hover:underline"
        onClick={() => roll({ label: "Спасбросок от смерти", value: { n: 0, dice: [] }, d20: "normal" })}
      >
        Спасбросок
      </button>
      <span className="flex gap-0.5">{dots(ok, "deathSuccesses", "border-good bg-good")}</span>
      <span className="flex gap-0.5">{dots(fail, "deathFailures", "border-danger bg-danger")}</span>
    </span>
  );
}

function Inspiration() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const ask = useAsk();
  const count = doc.combat.inspiration;
  const max = sheet.inspirationMax;
  const gain = async () => {
    if (max !== null && count >= max) return toast.error(`Больше ${max} вдохновения не помещается`);
    let reason = "";
    if (doc.settings.requireReasons) {
      const r = await ask.text({ title: "Вдохновение", label: "За что получено", required: true, placeholder: "Отыгрыш, решение мастера…", reasonSuggestions: true });
      if (r === null) return;
      reason = r;
    }
    change(
      (d) => {
        d.combat.inspiration = count + 1;
      },
      makeEvent("inspiration", `Вдохновение: ${count} → ${count + 1}`, reason),
    );
  };
  const spend = () => {
    if (count <= 0) return;
    change(
      (d) => {
        d.combat.inspiration = count - 1;
      },
      makeEvent("inspiration", `Потрачено вдохновение: ${count} → ${count - 1}`),
    );
  };
  return (
    <VitalCard label={max !== null ? `Вдохн. · макс ${max}` : "Вдохновение"}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={spend} disabled={count <= 0} className="rounded p-0.5 text-faint hover:text-text disabled:opacity-30" aria-label="Потратить вдохновение">
          <Minus className="size-3.5" />
        </button>
        <span className="flex min-w-8 items-center justify-center gap-0.5 font-display text-xl font-bold tabular-nums">
          {count > 0 && count <= 3 ? (
            Array.from({ length: count }, (_, i) => <Star key={i} className="size-4 fill-accent text-accent" />)
          ) : (
            <>
              <Star className={cn("size-4", count ? "fill-accent text-accent" : "text-faint")} />
              {count}
            </>
          )}
        </span>
        <button type="button" onClick={gain} className="rounded p-0.5 text-faint hover:text-text" aria-label="Получить вдохновение">
          <Plus className="size-3.5" />
        </button>
      </div>
    </VitalCard>
  );
}

export function ConcentrationChip() {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const c = doc.combat.concentration;
  if (!c) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-muted"
        onClick={async () => {
          const name = await ask.text({ title: "Начать концентрацию", label: "На чём", required: true, placeholder: "Название заклинания или эффекта" });
          if (!name) return;
          change(
            (d) => {
              d.combat.concentration = { name, spellEntryId: "", startedAt: new Date().toISOString(), note: "" };
            },
            makeEvent("concentration", `Концентрация: «${name}»`),
          );
        }}
      >
        <Brain /> Нет концентрации
      </Button>
    );
  }
  const since = c.startedAt ? new Date(c.startedAt) : null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-magic/50 bg-magic-soft px-3 py-1.5 text-magic">
      <Brain className="size-4 shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] font-semibold tracking-widest uppercase opacity-80">Концентрация</div>
        <div className="truncate text-sm font-semibold" title={since ? `С ${since.toLocaleString("ru")}` : undefined}>
          {c.name}
        </div>
      </div>
      <Tip content="Прервать концентрацию">
        <button
          type="button"
          className="rounded-md p-1 hover:bg-magic/20"
          aria-label="Прервать концентрацию"
          onClick={() =>
            change(
              (d) => {
                d.combat.concentration = null;
              },
              makeEvent("concentration", `Концентрация на «${c.name}» окончена`),
            )
          }
        >
          <X className="size-4" />
        </button>
      </Tip>
    </div>
  );
}

function Conditions() {
  const doc = useDoc();
  const change = useChange();
  const active = doc.combat.conditions;
  const toggle = (id: string) => {
    const on = !active.includes(id);
    change(
      (d) => {
        d.combat.conditions = on ? [...d.combat.conditions, id] : d.combat.conditions.filter((x) => x !== id);
      },
      makeEvent("condition", `${on ? "Наложено" : "Снято"} состояние «${conditionLabel(id)}»`),
    );
  };
  const exhaustion = doc.combat.exhaustion;
  const showExhaustion = !doc.settings.hidden.includes("combat.exhaustion");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map((id) => (
        <Tip key={id} content={conditionDef(id)?.summary}>
          <span className="inline-flex items-center gap-1 rounded-lg bg-danger-soft py-1 pr-1 pl-2 text-xs font-medium text-danger">
            {conditionLabel(id)}
            <button type="button" onClick={() => toggle(id)} className="rounded p-0.5 hover:bg-danger/20" aria-label={`Снять ${conditionLabel(id)}`}>
              <X className="size-3" />
            </button>
          </span>
        </Tip>
      ))}
      {showExhaustion && exhaustion > 0 && (
        <span className="rounded-lg bg-danger-soft px-2 py-1 text-xs font-medium text-danger">Истощение {exhaustion}</span>
      )}
      <Popover
        trigger={
          <Button size="sm" variant="ghost" className="text-muted">
            <Sparkles /> Состояния
          </Button>
        }
        className="w-72"
      >
        <div className="flex flex-col gap-1">
          {CONDITIONS.map((c) => (
            <Tip key={c.id} content={c.summary} side="left">
              <div>
                <Checkbox checked={active.includes(c.id)} onChange={() => toggle(c.id)} label={c.label} className="w-full py-0.5" />
              </div>
            </Tip>
          ))}
          {showExhaustion && (
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm">
              <span>Истощение</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() =>
                      change(
                        (d) => {
                          d.combat.exhaustion = lvl;
                        },
                        makeEvent("condition", `Истощение: ${exhaustion} → ${lvl}`),
                      )
                    }
                    className={cn(
                      "size-6 rounded-md text-xs font-semibold tabular-nums",
                      lvl === exhaustion ? (lvl ? "bg-danger text-white" : "bg-panel-3 text-text") : "text-muted hover:bg-panel-2",
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}

export function Vitals() {
  const sheet = useComputed();
  const doc = useDoc();
  const open = useOpenDialog();
  const otherSpeeds = SPEED_TYPES.filter((s) => s !== "walk" && sheet.speed[s].value > 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
        <ArmorClass />
        <VitalCard label="Инициатива" short="Иниц.">
          <StatPopover
            title="Инициатива"
            stat={sheet.initiative}
            rollLabel="Инициатива"
            trigger={
              <button type="button" className={bigValue}>
                {formatStat(sheet.initiative)}
                <StatFlags stat={sheet.initiative} />
              </button>
            }
          />
        </VitalCard>
        <VitalCard label="Скорость" short="Скор.">
          <StatPopover
            title="Скорость"
            stat={sheet.speed.walk}
            signed={false}
            trigger={
              <button type="button" className={bigValue}>
                {sheet.speed.walk.value}
                <span className="ml-0.5 text-xs font-normal text-muted">фт</span>
              </button>
            }
          >
            {otherSpeeds.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                {otherSpeeds.map((s) => (
                  <div key={s} className="flex justify-between">
                    <span className="text-muted">{SPEED_LABELS[s]}</span>
                    <span className="font-semibold">{sheet.speed[s].value} фт.</span>
                  </div>
                ))}
              </div>
            )}
          </StatPopover>
          {otherSpeeds.length > 0 && (
            <div className="text-[10px] text-muted">{otherSpeeds.map((s) => `${SPEED_LABELS[s].toLowerCase()} ${sheet.speed[s].value}`).join(", ")}</div>
          )}
        </VitalCard>
        <VitalCard label="Мастерство" short="Маст.">
          <StatPopover
            title="Бонус мастерства"
            stat={sheet.prof}
            trigger={
              <button type="button" className={bigValue}>
                {formatStat(sheet.prof)}
              </button>
            }
          />
        </VitalCard>
        <div className="col-span-4 flex sm:contents">
          <HitPoints />
        </div>
        {!doc.settings.hidden.includes("combat.inspiration") && (
          <div className="col-span-4 flex sm:contents max-sm:[&>*]:flex-1">
            <Inspiration />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConcentrationChip />
        {!doc.settings.hidden.includes("combat.conditions") && <Conditions />}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => open({ kind: "rest", rest: "short" })}>
            <Sun /> Короткий отдых
          </Button>
          <Button size="sm" variant="outline" onClick={() => open({ kind: "rest", rest: "long" })}>
            <Moon /> Длинный отдых
          </Button>
        </div>
      </div>
    </div>
  );
}
