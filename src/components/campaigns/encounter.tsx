"use client";

import { ChevronRight, Dices, Eye, EyeOff, Flag, Heart, Play, Plus, Shield, SkipForward, Sparkles, Swords, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCr, type CreatureRow } from "@/lib/bestiary";
import { hpWord, sortCombatants, type Combatant, type EncounterRow, type PlayerCombatant } from "@/lib/encounter";
import type { LootTableRow } from "@/lib/loot";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Modal, Tip } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { CreatureDialog } from "./bestiary";
import { run, useCampaign, useScopeData } from "./context";

// Initiative tracker. The GM runs the fight; players see the order, whose
// turn it is and how hurt everyone looks, and type their own initiative.

function CreaturePicker({ onPick }: { onPick: (c: CreatureRow) => void }) {
  const { id: campaignId } = useCampaign();
  const [q, setQ] = useState("");
  const [list, setList] = useState<CreatureRow[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    let alive = true;
    const t = setTimeout(() => {
      api<{ creatures: CreatureRow[] }>(`/api/bestiary?campaignId=${campaignId}&limit=8&q=${encodeURIComponent(q.trim())}`)
        .then((r) => alive && setList(r.creatures))
        .catch(() => {});
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, campaignId]);
  return (
    <div className="flex flex-col gap-1">
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти в бестиарии: гоблин, огр…" />
      {q.trim() && list.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center gap-2 border-b border-line px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-panel-2"
              onClick={() => {
                onPick(c);
                setQ("");
              }}
            >
              <span className="flex-1">{c.nameRu}</span>
              <span className="text-xs text-muted">
                ОП {formatCr(c.cr)} · КД {c.ac} · ♥ {c.hp}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMonsters({ encounterId, onClose }: { encounterId: string; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const [creature, setCreature] = useState<CreatureRow | null>(null);
  const [count, setCount] = useState(1);
  const [rollHp, setRollHp] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [npc, setNpc] = useState({ name: "", hp: 10, ac: 12, initBonus: 0 });
  const url = `/api/campaigns/${campaignId}/encounters/${encounterId}`;
  const add = async () => {
    if (creature) {
      if (await run(() => api(url, { method: "POST", body: { action: "addMonsters", creatureId: creature.id, count, rollHp, hidden } }))) onClose();
    } else if (npc.name.trim()) {
      if (await run(() => api(url, { method: "POST", body: { action: "addNpc", ...npc } }))) onClose();
    }
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Добавить в бой"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={add} disabled={!creature && !npc.name.trim()}>
            Добавить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Монстр из бестиария">
          {creature ? (
            <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <span className="flex-1 font-medium">{creature.nameRu}</span>
              <span className="text-xs text-muted">
                ОП {formatCr(creature.cr)} · ♥ {creature.hp}
                {creature.hpFormula ? ` (${creature.hpFormula})` : ""}
              </span>
              <Button size="xs" variant="ghost" onClick={() => setCreature(null)}>
                Другой
              </Button>
            </div>
          ) : (
            <CreaturePicker onPick={setCreature} />
          )}
        </Field>
        {creature && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Сколько" className="w-24">
              <NumberInput value={count} min={1} max={30} onCommit={(v) => setCount(Math.max(1, Math.min(30, v)))} />
            </Field>
            <Checkbox label="Бросить хиты по костям" checked={rollHp} disabled={!creature.hpFormula} onChange={(e) => setRollHp(e.target.checked)} />
            <Checkbox label="Спрятаны от игроков" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          </div>
        )}
        {!creature && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
            <span className="text-sm text-muted">Или участник без статблока (НИП, союзник):</span>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Имя" className="min-w-40 flex-1">
                <Input value={npc.name} onChange={(e) => setNpc({ ...npc, name: e.target.value })} />
              </Field>
              <Field label="Хиты" className="w-20">
                <NumberInput value={npc.hp} min={0} onCommit={(hp) => setNpc({ ...npc, hp })} />
              </Field>
              <Field label="КД" className="w-20">
                <NumberInput value={npc.ac} min={0} onCommit={(ac) => setNpc({ ...npc, ac })} />
              </Field>
              <Field label="Иниц." className="w-20">
                <NumberInput value={npc.initBonus} onCommit={(initBonus) => setNpc({ ...npc, initBonus })} />
              </Field>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CombatantRow({
  c,
  current,
  encounter,
  tables,
  onView,
}: {
  c: Combatant;
  current: boolean;
  encounter: EncounterRow;
  tables: LootTableRow[];
  onView: (creatureId: string) => void;
}) {
  const { id: campaignId } = useCampaign();
  const ask = useAsk();
  const url = `/api/campaigns/${campaignId}/encounters/${encounter.id}`;
  const post = (body: Record<string, unknown>) => run(() => api(url, { method: "POST", body }));
  const update = (patch: Partial<Combatant>) => post({ action: "update", combatant: { ...c, ...patch } });
  const hit = async (heal: boolean) => {
    const r = await ask.amount({
      title: `${c.name}: ${heal ? "лечение" : "урон"}`,
      direction: "gain",
      allowDirection: false,
      integer: true,
      noReason: true,
      confirmLabel: heal ? "Лечить" : "Нанести",
    });
    if (r && r.delta) await post({ action: "hp", id: c.id, delta: heal ? -Math.abs(r.delta) : Math.abs(r.delta) });
  };
  const loot = async (tableId: string) => {
    await run(
      () => api(`/api/campaigns/${campaignId}/loot/drafts`, { method: "POST", body: { tableId, title: `Добыча: ${c.name}` } }),
      "Добыча во вкладке «Лут»",
    );
  };
  const dead = c.hp <= 0 && c.kind !== "pc";
  const pct = c.maxHp ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 last:border-b-0", current && "bg-accent-soft", dead && "opacity-60")}>
      <span className="w-4 text-accent">{current && <ChevronRight className="size-4" />}</span>
      <NumberInput
        value={c.initiative ?? 0}
        onCommit={(v) => update({ initiative: v })}
        className={cn("w-16 text-center", c.initiative === null && "text-faint")}
        aria-label="Инициатива"
      />
      <div className="min-w-36 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {c.creatureId ? (
            <button type="button" className={cn("font-medium hover:text-accent", dead && "line-through")} onClick={() => onView(c.creatureId!)}>
              {c.name}
            </button>
          ) : (
            <span className={cn("font-medium", dead && "line-through")}>{c.name}</span>
          )}
          {c.kind === "pc" && <Badge tone="info">игрок</Badge>}
          {c.hidden && <Badge tone="magic">спрятан</Badge>}
          {c.conditions.map((x) => (
            <Badge key={x}>{x}</Badge>
          ))}
        </div>
        <div className="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-panel-3">
          <div className={cn("h-full rounded-full", pct > 50 ? "bg-good" : pct > 20 ? "bg-accent" : "bg-danger")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Tip content={`Игроки видят: ${hpWord(c.hp, c.maxHp)}`}>
        <span className="flex w-20 items-center gap-1 text-sm tabular-nums">
          <Heart className="size-3.5 text-danger" /> {c.hp}/{c.maxHp}
        </span>
      </Tip>
      <span className="flex w-12 items-center gap-1 text-sm text-muted tabular-nums">
        <Shield className="size-3.5" /> {c.ac}
      </span>
      <Button size="xs" variant="outline" onClick={() => hit(false)}>
        Урон
      </Button>
      <Button size="xs" variant="ghost" onClick={() => hit(true)}>
        Лечить
      </Button>
      {c.kind !== "pc" && (
        <Button size="icon-sm" variant="ghost" aria-label={c.hidden ? "Показать игрокам" : "Спрятать"} onClick={() => update({ hidden: !c.hidden })}>
          {c.hidden ? <EyeOff /> : <Eye />}
        </Button>
      )}
      {dead && tables.length > 0 && (
        <Select
          value=""
          onChange={(e) => e.target.value && void loot(e.target.value)}
          placeholder="Лут…"
          className="h-7 w-32 text-xs"
          options={tables.map((t) => ({ value: t.id, label: t.name }))}
        />
      )}
      <Button size="icon-sm" variant="ghost" aria-label="Убрать из боя" onClick={() => post({ action: "remove", id: c.id })}>
        <Trash2 />
      </Button>
    </div>
  );
}

function GmEncounter({ e }: { e: EncounterRow }) {
  const { id: campaignId } = useCampaign();
  const [tables] = useScopeData<{ tables: LootTableRow[] }>("loot", `/api/campaigns/${campaignId}/loot/tables`);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const ask = useAsk();
  const url = `/api/campaigns/${campaignId}/encounters/${e.id}`;
  const post = (body: Record<string, unknown>) => run(() => api(url, { method: "POST", body }));
  const sorted = sortCombatants(e.combatants);
  const currentId = e.status === "active" ? sorted[e.turn]?.id : null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Swords className="size-4 text-danger" /> {e.name}
          {e.status === "active" && <Badge tone="danger">раунд {e.round}</Badge>}
          {e.status === "done" && <Badge>окончен</Badge>}
        </span>
      }
      actions={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Удалить бой"
          onClick={async () => {
            if (await ask.confirm({ title: `Удалить «${e.name}»?`, confirmLabel: "Удалить", danger: true })) await run(() => api(url, { method: "DELETE" }));
          }}
        >
          <Trash2 />
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button size="sm" variant="outline" onClick={() => post({ action: "addParty" })}>
          <Users /> Партия
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <UserPlus /> Монстры
        </Button>
        <Button size="sm" variant="outline" onClick={() => post({ action: "rollInitiative" })}>
          <Dices /> Инициатива монстрам
        </Button>
        <div className="flex-1" />
        {e.status === "prep" && (
          <Button size="sm" variant="primary" onClick={() => post({ action: "start" })} disabled={!e.combatants.length}>
            <Play /> Начать
          </Button>
        )}
        {e.status === "active" && (
          <>
            <Button size="sm" variant="primary" onClick={() => post({ action: "next" })}>
              <SkipForward /> Следующий ход
            </Button>
            <Button size="sm" variant="ghost" onClick={() => post({ action: "end" })}>
              <Flag /> Закончить
            </Button>
          </>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="p-4">
          <Empty title="В бою никого">Добавьте партию и монстров. Инициативу игроки могут ввести сами на своей странице кампании.</Empty>
        </div>
      ) : (
        sorted.map((c) => <CombatantRow key={c.id} c={c} current={c.id === currentId} encounter={e} tables={tables?.tables ?? []} onView={setViewing} />)
      )}
      {e.log.length > 0 && (
        <details className="border-t border-line px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer">Журнал боя</summary>
          <div className="mt-1 flex flex-col">
            {e.log
              .slice(-30)
              .reverse()
              .map((l, i) => (
                <span key={i}>{l}</span>
              ))}
          </div>
        </details>
      )}
      {adding && <AddMonsters encounterId={e.id} onClose={() => setAdding(false)} />}
      {viewing && <CreatureDialog id={viewing} onClose={() => setViewing(null)} />}
    </Panel>
  );
}

type PlayerView = { id: string; name: string; round: number; current: string | null; combatants: PlayerCombatant[] } | null;

function PlayerEncounter({ view }: { view: NonNullable<PlayerView> }) {
  const { id: campaignId, detail } = useCampaign();
  const mine = detail.characters.filter((c) => c.mine && c.status === "accepted").map((c) => c.characterId);
  const setInit = (characterId: string, initiative: number) =>
    run(() => api(`/api/campaigns/${campaignId}/encounters/initiative`, { method: "POST", body: { characterId, initiative } }));
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Swords className="size-4 text-danger" /> {view.name}
          <Badge tone="danger">раунд {view.round}</Badge>
        </span>
      }
      bodyClassName="p-0"
    >
      {view.combatants.map((c) => {
        const own = !!c.characterId && mine.includes(c.characterId);
        return (
          <div key={c.id} className={cn("flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0", c.id === view.current && "bg-accent-soft")}>
            <span className="w-4 text-accent">{c.id === view.current && <ChevronRight className="size-4" />}</span>
            {own ? (
              <NumberInput value={c.initiative ?? 0} onCommit={(v) => setInit(c.characterId!, v)} className="w-16 text-center" aria-label="Моя инициатива" />
            ) : (
              <span className="w-16 text-center text-sm text-muted tabular-nums">{c.initiative ?? "—"}</span>
            )}
            <span className={cn("flex-1 font-medium", own && "text-accent")}>{c.name}</span>
            {c.conditions.map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
            <span className="text-sm text-muted">{c.health}</span>
          </div>
        );
      })}
    </Panel>
  );
}

export function EncounterTab() {
  const { id: campaignId, gm } = useCampaign();
  const [data] = useScopeData<{ encounters?: EncounterRow[]; view?: PlayerView }>("encounter", `/api/campaigns/${campaignId}/encounters`);
  const [selected, setSelected] = useState<string | null>(null);
  if (!data)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (!gm) {
    return data.view ? (
      <PlayerEncounter view={data.view} />
    ) : (
      <Empty icon={<Swords />} title="Сейчас не бой">
        Когда ГМ начнёт бой, здесь появится порядок ходов.
      </Empty>
    );
  }
  const list = data.encounters ?? [];
  const open = list.filter((e) => e.status !== "done");
  const current = list.find((e) => e.id === selected) ?? open[0] ?? null;
  const create = async () => {
    const r = await api<{ id: string }>(`/api/campaigns/${campaignId}/encounters`, { method: "POST", body: { name: `Бой ${list.length + 1}` } }).catch(
      () => null,
    );
    if (r) setSelected(r.id);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {list.length > 0 && (
          <Select
            value={current?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className="w-64"
            options={list.map((e) => ({ value: e.id, label: `${e.name}${e.status === "done" ? " (окончен)" : e.status === "active" ? " (идёт)" : ""}` }))}
          />
        )}
        <Button variant="primary" onClick={create}>
          <Plus /> Новый бой
        </Button>
        {current?.status === "done" && (
          <span className="flex items-center gap-1 text-sm text-muted">
            <Sparkles className="size-4" /> Поверженных можно обыскать: кнопка «Лут» у каждого.
          </span>
        )}
      </div>
      {current ? (
        <GmEncounter e={current} />
      ) : (
        <Empty icon={<Swords />} title="Боёв нет">
          Соберите бой заранее: партия, монстры из бестиария, спрятанная засада. Раунды сами отсчитывают выдачи «на N раундов».
        </Empty>
      )}
    </div>
  );
}
