"use client";

import { Check, Dices, Dna, RefreshCw, Save, Skull, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatCr, SIZE_LABELS, type Size } from "@/lib/bestiary";
import {
  DEATH_THRESHOLDS,
  formatDeadTime,
  mutationCount,
  mutationPartLabel,
  REROLL_LABELS,
  type MutationDraftRow,
  type MutationRoll,
  type Reroll,
} from "@/lib/mutations";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select, Textarea } from "@/components/ui/input";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Menu } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { EffectsEditor } from "@/components/sheet/effects";
import { api } from "./api";
import { CreatureDialog } from "./bestiary";
import { run, useCampaign, useScopeData } from "./context";
import { useParty } from "./grants";
import { SandboxSheet } from "./library";

// Mutations after death: roll by the GM's table, reroll a filter, describe
// what the body part gives, apply as locked grants.

const UNITS = [
  { value: "1", label: "минут" },
  { value: "60", label: "часов" },
  { value: "1440", label: "дней" },
  { value: "10080", label: "недель" },
  { value: "43200", label: "месяцев" },
];

function RollForm() {
  const { id: campaignId } = useCampaign();
  const party = useParty();
  const [characterId, setCharacterId] = useState("");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("1440");
  const [busy, setBusy] = useState(false);
  const minutes = Math.round(amount * Number(unit));
  const count = mutationCount(minutes);
  const roll = async () => {
    setBusy(true);
    await run(() => api(`/api/campaigns/${campaignId}/mutations`, { method: "POST", body: { characterId, minutes } }), "Мутации брошены");
    setBusy(false);
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Skull className="size-4 text-danger" /> Персонаж вернулся с того света
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Кто" className="w-48">
            <Select
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              placeholder="Выберите персонажа"
              options={party.map((c) => ({ value: c.characterId, label: c.name }))}
            />
          </Field>
          <Field label="Сколько был мёртв" className="w-28">
            <NumberInput value={amount} min={0} onCommit={setAmount} />
          </Field>
          <Field label="&nbsp;" className="w-28">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)} options={UNITS} />
          </Field>
          <Button variant="primary" onClick={roll} disabled={busy || !characterId || !count}>
            <Dices /> Бросить {count ? `(${count})` : ""}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Мутаций столько, сколько порогов пройдено: {DEATH_THRESHOLDS.map((t) => t.label).join(", ")}. Сейчас: {formatDeadTime(minutes)}, мутаций {count}.
        </p>
      </div>
    </Panel>
  );
}

function RollCard({
  roll,
  index,
  onChange,
  onReroll,
  onView,
}: {
  roll: MutationRoll;
  index: number;
  onChange: (r: MutationRoll) => void;
  onReroll: (what: Reroll) => void;
  onView: (creatureId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold">#{index + 1}</span>
        <Badge tone="danger" title="Бросок d20">
          d20: {roll.dangerRoll}
          {roll.danger !== roll.dangerRoll ? ` → ОП ${formatCr(roll.danger)}` : ""}
        </Badge>
        <Badge>{roll.type || "тип ?"}</Badge>
        <Badge>{roll.size ? SIZE_LABELS[roll.size as Size] : "размер ?"}</Badge>
        <Badge tone="info" title="Бросок d6">
          d6: {roll.partRoll} · {mutationPartLabel(roll.part)}
        </Badge>
        {roll.creatureId ? (
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => onView(roll.creatureId!)}>
            {roll.creatureName}
          </button>
        ) : (
          <span className="text-danger">существо не нашлось</span>
        )}
        <div className="flex-1" />
        <Menu
          trigger={
            <Button size="xs" variant="outline">
              <RefreshCw /> Перебросить
            </Button>
          }
          items={(Object.keys(REROLL_LABELS) as Reroll[]).map((w) => ({ label: REROLL_LABELS[w], onSelect: () => onReroll(w) }))}
        />
      </div>
      {roll.log.length > 0 && <div className="text-xs text-faint">{roll.log.join(" · ")}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Название на листе">
          <Input value={roll.name} onChange={(e) => onChange({ ...roll, name: e.target.value })} placeholder="Ноги: Сатир" />
        </Field>
        <Field label="Что даёт (текст для игрока)">
          <Textarea
            value={roll.text}
            onChange={(e) => onChange({ ...roll, text: e.target.value })}
            className="min-h-10"
            placeholder="Скорость +10 фт., атака копытом 1d4…"
          />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted">Эффекты на листе ({roll.effects.length})</summary>
        <div className="mt-2">
          <EffectsEditor effects={roll.effects} onChange={(effects) => onChange({ ...roll, effects })} />
        </div>
      </details>
    </div>
  );
}

function DraftCard({ draft }: { draft: MutationDraftRow }) {
  const { id: campaignId } = useCampaign();
  const ask = useAsk();
  const [rolls, setRolls] = useState(draft.rolls);
  const [base, setBase] = useState(draft.rolls);
  const [viewing, setViewing] = useState<string | null>(null);
  // A reroll on the server returns a new draft; keep local edits of the other rolls.
  if (base !== draft.rolls) {
    setBase(draft.rolls);
    setRolls(
      draft.rolls.map((r, i) =>
        rolls[i] && rolls[i].creatureId === r.creatureId && rolls[i].part === r.part
          ? { ...r, name: rolls[i].name, text: rolls[i].text, effects: rolls[i].effects }
          : r,
      ),
    );
  }
  const dirty = JSON.stringify(rolls) !== JSON.stringify(draft.rolls);
  const url = `/api/campaigns/${campaignId}/mutations/${draft.id}`;
  const save = () => run(() => api(url, { method: "POST", body: { action: "edit", rolls } }));
  const reroll = async (index: number, what: Reroll) => {
    if (dirty && !(await save())) return;
    await run(() => api(url, { method: "POST", body: { action: "reroll", index, what } }));
  };
  const apply = async () => {
    const ok = await ask.confirm({
      title: `Применить ${rolls.length} мутаций к ${draft.characterName}?`,
      description: "Мутации появятся в листе с замком: игрок не сможет их убрать. Часть тела «на выбор» придёт игроку предложением.",
      confirmLabel: "Применить",
    });
    if (!ok) return;
    if (dirty && !(await save())) return;
    await run(() => api(url, { method: "POST", body: { action: "apply" } }), "Мутации в листе");
  };
  const discard = async () => {
    if (await ask.confirm({ title: "Выбросить этот бросок?", confirmLabel: "Выбросить", danger: true }))
      await run(() => api(url, { method: "POST", body: { action: "discard" } }));
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Dna className="size-4 text-magic" /> {draft.characterName}: {formatDeadTime(draft.minutes)}
        </span>
      }
      actions={
        <>
          {dirty && (
            <Button size="sm" variant="outline" onClick={() => void save()}>
              <Save /> Сохранить
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={apply}>
            <Check /> Применить
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Выбросить" onClick={discard}>
            <Trash2 />
          </Button>
        </>
      }
    >
      <SandboxSheet>
        <div className="flex flex-col gap-2">
          {rolls.map((r, i) => (
            <RollCard
              key={i}
              roll={r}
              index={i}
              onChange={(next) => setRolls(rolls.map((x, j) => (j === i ? next : x)))}
              onReroll={(w) => void reroll(i, w)}
              onView={setViewing}
            />
          ))}
        </div>
      </SandboxSheet>
      {viewing && <CreatureDialog id={viewing} onClose={() => setViewing(null)} />}
    </Panel>
  );
}

export function MutationsTab() {
  const { id: campaignId } = useCampaign();
  const [data] = useScopeData<{ drafts: MutationDraftRow[] }>("mutations", `/api/campaigns/${campaignId}/mutations`);
  const open = (data?.drafts ?? []).filter((d) => d.status === "draft");
  const done = (data?.drafts ?? []).filter((d) => d.status === "applied").slice(0, 10);
  return (
    <div className="flex flex-col gap-4">
      <RollForm />
      {!data ? (
        <Spinner />
      ) : open.length === 0 ? (
        <Empty icon={<Dna />} title="Бросков нет">
          Опасность (d20) задаёт уровень опасности существа, тип и размер выпадают с равными шансами среди существ бестиария, часть тела по d6. Если существо не
          нашлось, опасность растёт; если и так нет, перебросьте тип или размер.
        </Empty>
      ) : (
        open.map((d) => <DraftCard key={d.id} draft={d} />)
      )}
      {done.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Применённые ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((d) => (
              <li key={d.id}>
                {d.characterName}, {formatDeadTime(d.minutes)}: {d.rolls.map((r) => r.name || r.creatureName).join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
