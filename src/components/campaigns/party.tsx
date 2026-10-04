"use client";

import { Brain, Eye, Footprints, Heart, Search, Shield, Skull, Sparkles, Star, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { PartyCharacter } from "@/lib/campaigns";
import { computeSheet, type Sheet } from "@/lib/rules/compute";
import { conditionLabel } from "@/lib/rules/conditions";
import { formatMod } from "@/lib/rules/constants";
import { CharacterDocSchema, type CharacterDoc } from "@/lib/rules/schema";
import { cn } from "@/lib/cn";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Badge, Empty } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";

export type PartySheet = PartyCharacter & { doc: CharacterDoc; sheet: Sheet };

/** Parses and computes every party document; broken documents are skipped. */
export function usePartySheets(party: PartyCharacter[]): PartySheet[] {
  return useMemo(
    () =>
      party.flatMap((p) => {
        const parsed = CharacterDocSchema.safeParse(p.doc);
        if (!parsed.success) return [];
        return [{ ...p, doc: parsed.data, sheet: computeSheet(parsed.data) }];
      }),
    [party],
  );
}

function hpTone(hp: number, max: number): { bar: string; text: string; word: string } {
  if (hp <= 0) return { bar: "bg-danger", text: "text-danger", word: "без сознания" };
  const r = max > 0 ? hp / max : 1;
  if (r <= 0.25) return { bar: "bg-danger", text: "text-danger", word: "при смерти" };
  if (r <= 0.5) return { bar: "bg-accent", text: "text-accent", word: "ранен" };
  if (r < 1) return { bar: "bg-good", text: "text-good", word: "задет" };
  return { bar: "bg-good", text: "text-good", word: "цел" };
}

function Metric({ icon, label, value, tip }: { icon: React.ReactNode; label: string; value: React.ReactNode; tip?: string }) {
  return (
    <Tip content={tip}>
      <div className="flex min-w-0 flex-col items-center rounded-lg bg-panel-2 px-1.5 py-1">
        <div className="flex items-center gap-1 text-[10px] tracking-wide text-faint uppercase [&_svg]:size-3">
          {icon}
          {label}
        </div>
        <div className="font-display text-lg leading-tight font-bold tabular-nums">{value}</div>
      </div>
    </Tip>
  );
}

function SlotPips({ total, used, label }: { total: number; used: number; label: string }) {
  const left = Math.max(0, total - used);
  return (
    <Tip content={`${label}: осталось ${left} из ${total}`}>
      <div className="flex items-center gap-1 text-[11px] text-muted">
        <span className="w-4 text-right tabular-nums">{label}</span>
        <div className="flex gap-0.5">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cn("size-2 rounded-full", i < left ? "bg-magic" : "bg-panel-3")} />
          ))}
        </div>
      </div>
    </Tip>
  );
}

export function PartyCard({ p }: { p: PartySheet }) {
  const { doc, sheet } = p;
  const hidden = new Set(doc.settings.hidden);
  const max = sheet.hpMax.value;
  const hp = doc.combat.hpCurrent;
  const tone = hpTone(hp, max);
  const classes = doc.classes.map((c) => `${c.name || "Класс"} ${c.level}`).join(" / ");
  const slots = sheet.spell.slots
    .map((total, lvl) => ({
      lvl,
      total,
      used: doc.spellcasting.slotsUsed[lvl] ?? 0,
    }))
    .filter((s) => s.lvl > 0 && s.total > 0);
  const conditions = doc.combat.conditions;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center gap-3">
        <AvatarImage
          src={doc.avatarUrl}
          className="size-12 shrink-0 rounded-lg object-cover"
          fallback={
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-panel-3 text-faint">
              <UserRound className="size-6" />
            </div>
          }
        />
        <div className="min-w-0 flex-1">
          <Link href={`/characters/${p.characterId}`} className="block truncate font-display text-lg font-bold hover:text-accent">
            {doc.name}
          </Link>
          <div className="truncate text-xs text-muted">
            {[doc.info.race, classes].filter(Boolean).join(", ") || "Без расы и класса"} · ур. {sheet.level}
          </div>
          <div className="truncate text-[11px] text-faint">Игрок: {p.ownerName}</div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-1 font-medium">
            <Heart className={cn("size-4", tone.text)} /> {hp} / {max}
            {doc.combat.hpTemp > 0 && <span className="text-info">+{doc.combat.hpTemp}</span>}
          </span>
          <span className={cn("text-xs", tone.text)}>{tone.word}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-3">
          <div
            className={cn("h-full rounded-full transition-all", tone.bar)}
            style={{
              width: `${max > 0 ? Math.min(100, (Math.max(0, hp) / max) * 100) : 0}%`,
            }}
          />
        </div>
        {hp <= 0 && !hidden.has("combat.deathSaves") && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <Skull className="size-3.5 text-danger" />
            успехи {doc.combat.deathSuccesses}/3 · провалы {doc.combat.deathFailures}/3
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Metric icon={<Shield />} label="КД" value={sheet.ac.value} tip="Класс доспеха" />
        <Metric icon={<Zap />} label="Иниц." value={formatMod(sheet.initiative.value)} tip="Инициатива" />
        <Metric icon={<Footprints />} label="Скор." value={sheet.speed.walk.value} tip="Скорость ходьбы, футы" />
        <Metric
          icon={<Sparkles />}
          label="СЛ"
          value={sheet.spell.hasCasting ? sheet.spell.dc.value : "—"}
          tip={sheet.spell.hasCasting ? "Сложность спасброска от заклинаний" : "Не колдует"}
        />
      </div>

      {!hidden.has("combat.passives") && (
        <div className="grid grid-cols-3 gap-1.5">
          <Metric icon={<Eye />} label="Восп." value={sheet.passives.perception.value} tip="Пассивное Восприятие" />
          <Metric icon={<Brain />} label="Прониц." value={sheet.passives.insight.value} tip="Пассивная Проницательность" />
          <Metric icon={<Search />} label="Анализ" value={sheet.passives.investigation.value} tip="Пассивный Анализ" />
        </div>
      )}

      {(conditions.length > 0 || doc.combat.exhaustion > 0 || doc.combat.concentration || doc.combat.inspiration > 0) && (
        <div className="flex flex-wrap gap-1">
          {doc.combat.concentration && (
            <Badge tone="magic" title={doc.combat.concentration.note || undefined}>
              Концентрация: {doc.combat.concentration.name}
            </Badge>
          )}
          {conditions.map((c) => (
            <Badge key={c} tone="danger">
              {conditionLabel(c)}
            </Badge>
          ))}
          {doc.combat.exhaustion > 0 && <Badge tone="danger">Истощение {doc.combat.exhaustion}</Badge>}
          {doc.combat.inspiration > 0 && !hidden.has("combat.inspiration") && (
            <Badge tone="accent">
              <Star className="size-3" /> Вдохновение
              {doc.combat.inspiration > 1 ? ` ×${doc.combat.inspiration}` : ""}
            </Badge>
          )}
        </div>
      )}

      {(slots.length > 0 || sheet.spell.pact.count > 0) && (
        <div className="flex flex-col gap-0.5">
          {slots.map((s) => (
            <SlotPips key={s.lvl} label={String(s.lvl)} total={s.total} used={s.used} />
          ))}
          {sheet.spell.pact.count > 0 && <SlotPips label={`П${sheet.spell.pact.level}`} total={sheet.spell.pact.count} used={doc.spellcasting.pactUsed} />}
        </div>
      )}
    </div>
  );
}

export function PartyGrid({ sheets }: { sheets: PartySheet[] }) {
  if (!sheets.length) {
    return (
      <Empty icon={<UserRound />} title="В партии пока никого">
        Позовите игроков ссылкой на вкладке «Участники». Когда они приведут персонажей и вы их примете, здесь появятся карточки.
      </Empty>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sheets.map((p) => (
        <PartyCard key={p.characterId} p={p} />
      ))}
    </div>
  );
}
