"use client";

import { CalendarDays, Dices, EyeOff, Flag, Play, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { ABILITIES, ABILITY_LABELS, SKILL_IDS, SKILLS } from "@/lib/rules/constants";
import { SESSION_STATUS_LABELS, type SessionRow } from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select, Textarea } from "@/components/ui/input";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { CharacterPicker, useParty } from "./grants";

// Game sessions (offline evenings): plan, attendance, recap and rewards; and
// the GM's secret rolls.

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function SessionEditor({ s, onClose }: { s: SessionRow | null; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const party = useParty();
  const [d, setD] = useState({
    title: s?.title ?? "",
    plannedAt: toLocalInput(s?.plannedAt ?? null),
    plan: s?.plan ?? "",
    report: s?.report ?? "",
    attendance: s?.attendance ?? party.map((c) => c.characterId),
  });
  const save = async () => {
    const data = { ...d, plannedAt: d.plannedAt ? new Date(d.plannedAt).toISOString() : null };
    const ok = await run(() =>
      s
        ? api(`/api/campaigns/${campaignId}/sessions/${s.id}`, { method: "POST", body: { action: "save", data } })
        : api(`/api/campaigns/${campaignId}/sessions`, { method: "POST", body: data }),
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={s ? `Сессия ${s.number}` : "Новая сессия"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save}>
            <Save /> Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название">
            <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Туман над Баровией" />
          </Field>
          <Field label="Когда">
            <Input type="datetime-local" value={d.plannedAt} onChange={(e) => setD({ ...d, plannedAt: e.target.value })} />
          </Field>
        </div>
        <Field label="Кто придёт">
          <CharacterPicker value={d.attendance} onChange={(attendance) => setD({ ...d, attendance })} />
        </Field>
        <Field label="План (видит только ГМ)">
          <Textarea value={d.plan} onChange={(e) => setD({ ...d, plan: e.target.value })} className="min-h-28" />
        </Field>
        <Field label="Итоги (видят все)">
          <Textarea value={d.report} onChange={(e) => setD({ ...d, report: e.target.value })} className="min-h-28" />
        </Field>
      </div>
    </Modal>
  );
}

function EndDialog({ s, onClose }: { s: SessionRow; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const [xp, setXp] = useState(0);
  const [reason, setReason] = useState(s.title ? `Сессия ${s.number} «${s.title}»` : `Сессия ${s.number}`);
  const end = async () => {
    if (await run(() => api(`/api/campaigns/${campaignId}/sessions/${s.id}`, { method: "POST", body: { action: "end", xp, reason } }), "Сессия закончена"))
      onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Закончить сессию ${s.number}`}
      description="Выдачи «до конца сессии» закончатся у всей партии."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={end}>
            <Flag /> Закончить
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Опыт каждому" hint="Тем, кто пришёл">
          <NumberInput value={xp} min={0} onCommit={setXp} />
        </Field>
        <Field label="За что">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function SessionsTab() {
  const { id: campaignId, gm } = useCampaign();
  const [data] = useScopeData<{ sessions: SessionRow[] }>("sessions", `/api/campaigns/${campaignId}/sessions`);
  const [editing, setEditing] = useState<SessionRow | "new" | null>(null);
  const [ending, setEnding] = useState<SessionRow | null>(null);
  const party = useParty();
  const ask = useAsk();
  const names = new Map(party.map((c) => [c.characterId, c.name]));
  const act = (s: SessionRow, action: string) => run(() => api(`/api/campaigns/${campaignId}/sessions/${s.id}`, { method: "POST", body: { action } }));
  if (!data) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      {gm && (
        <Button variant="primary" className="self-start" onClick={() => setEditing("new")}>
          <Plus /> Сессия
        </Button>
      )}
      {data.sessions.length === 0 ? (
        <Empty icon={<CalendarDays />} title="Сессий пока не было">
          {gm ? "Запланируйте вечер: кто придёт, план для себя, итоги для всех. В конце можно выдать опыт." : "Здесь появятся итоги игр."}
        </Empty>
      ) : (
        data.sessions.map((s) => (
          <Panel
            key={s.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                Сессия {s.number}
                {s.title && <span className="font-normal text-muted">«{s.title}»</span>}
                <Badge tone={s.status === "active" ? "danger" : s.status === "done" ? "neutral" : "info"}>{SESSION_STATUS_LABELS[s.status]}</Badge>
              </span>
            }
            actions={
              gm && (
                <>
                  {s.status === "planned" && (
                    <Button size="sm" variant="subtle" onClick={() => act(s, "start")}>
                      <Play /> Начать
                    </Button>
                  )}
                  {s.status !== "done" && (
                    <Button size="sm" variant="outline" onClick={() => setEnding(s)}>
                      <Flag /> Закончить
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    Изменить
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Удалить"
                    onClick={async () => {
                      if (await ask.confirm({ title: `Удалить сессию ${s.number}?`, confirmLabel: "Удалить", danger: true })) await act(s, "delete");
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )
            }
          >
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted" suppressHydrationWarning>
                {s.plannedAt && <span>{new Date(s.plannedAt).toLocaleString("ru", { dateStyle: "medium", timeStyle: "short" })}</span>}
                {s.attendance.length > 0 && <span>Были: {s.attendance.map((id) => names.get(id) ?? "ушедший персонаж").join(", ")}</span>}
                {s.rewards && s.rewards.xp > 0 && <span>Опыт: +{s.rewards.xp}</span>}
              </div>
              {gm && s.plan && (
                <details>
                  <summary className="flex cursor-pointer items-center gap-1 text-muted">
                    <EyeOff className="size-3.5" /> План
                  </summary>
                  <p className="mt-1 whitespace-pre-line">{s.plan}</p>
                </details>
              )}
              {s.report && <p className="whitespace-pre-line">{s.report}</p>}
            </div>
          </Panel>
        ))
      )}
      {editing && <SessionEditor s={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {ending && <EndDialog s={ending} onClose={() => setEnding(null)} />}
    </div>
  );
}

const CHECK_OPTIONS = [
  ...SKILL_IDS.map((s) => ({ value: `skill.${s}`, label: SKILLS[s].label, group: "Навыки" })),
  ...ABILITIES.map((a) => ({ value: `save.${a}`, label: `Спасбросок ${ABILITY_LABELS[a].short}`, group: "Спасброски" })),
  ...ABILITIES.map((a) => ({ value: `ability.${a}.check`, label: `Проверка ${ABILITY_LABELS[a].short}`, group: "Характеристики" })),
  { value: "initiative", label: "Инициатива", group: "Другое" },
];

type SecretResult = { characterId: string; name: string; rolls: number[]; bonus: number; total: number };

/** The GM rolls a check for players without them noticing. */
export function SecretRoll() {
  const { id: campaignId } = useCampaign();
  const [ids, setIds] = useState<string[]>([]);
  const [check, setCheck] = useState("skill.perception");
  const [results, setResults] = useState<SecretResult[] | null>(null);
  const roll = async () => {
    try {
      const r = await api<{ results: SecretResult[] }>(`/api/campaigns/${campaignId}/secret-roll`, { method: "POST", body: { characterIds: ids, check } });
      setResults(r.results);
    } catch (e) {
      await run(() => Promise.reject(e));
    }
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <EyeOff className="size-4 text-magic" /> Тайный бросок
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <CharacterPicker value={ids} onChange={setIds} />
        <div className="flex flex-wrap items-end gap-2">
          <Select value={check} onChange={(e) => setCheck(e.target.value)} options={CHECK_OPTIONS} className="w-56" />
          <Button variant="primary" onClick={roll} disabled={!ids.length}>
            <Dices /> Бросить
          </Button>
        </div>
        {results && (
          <div className="flex flex-col gap-1 text-sm">
            {results.map((r) => (
              <div key={r.characterId} className="flex items-center gap-2">
                <span className="flex-1">{r.name}</span>
                <span className="text-muted tabular-nums">
                  {r.rolls.join(" / ")} {r.bonus >= 0 ? "+" : "−"} {Math.abs(r.bonus)}
                </span>
                <span className="w-10 text-right font-display text-lg font-bold tabular-nums">{r.total}</span>
              </div>
            ))}
            <p className="text-xs text-faint">Игроки не видят этот бросок, в журнал он не пишется.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
