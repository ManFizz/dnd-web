"use client";

import { ArrowDownToLine, ArrowUpFromLine, Coins, Package, Send, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { CONDITION_OPTIONS, QUICK_ACTION_LABELS, QUICK_ACTIONS, type QuickAction, type Stash } from "@/lib/grants";
import { COIN_LABELS, COINS, type Coin } from "@/lib/rules/constants";
import { ITEM_CATEGORY_LABELS } from "@/lib/rules/labels";
import { CharacterDocSchema, type Item } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Empty, Panel, Spinner } from "@/components/ui/misc";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { CharacterPicker, useParty } from "./grants";

// The party stash (shared items and coins) and the GM's quick actions.

const COIN_OPTIONS = COINS.map((c) => ({ value: c, label: COIN_LABELS[c].full }));

export function QuickActions() {
  const { id: campaignId } = useCampaign();
  const [ids, setIds] = useState<string[]>([]);
  const [action, setAction] = useState<QuickAction["action"]>("damage");
  const [amount, setAmount] = useState(0);
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0]?.value ?? "");
  const [coin, setCoin] = useState<Coin>("gp");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const usesCondition = action === "condition" || action === "uncondition";
  const apply = async () => {
    setBusy(true);
    const ok = await run(
      () => api(`/api/campaigns/${campaignId}/actions`, { method: "POST", body: { characterIds: ids, action, amount, condition, coin, reason } }),
      "Готово",
    );
    setBusy(false);
    if (ok) setReason("");
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Zap className="size-4 text-accent" /> Быстрые действия
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <CharacterPicker value={ids} onChange={setIds} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Действие" className="w-48">
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value as QuickAction["action"])}
              options={QUICK_ACTIONS.map((a) => ({ value: a, label: QUICK_ACTION_LABELS[a] }))}
            />
          </Field>
          {usesCondition ? (
            <Field label="Состояние" className="w-44">
              <Select value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITION_OPTIONS} />
            </Field>
          ) : (
            <Field label={action === "damage" || action === "heal" || action === "temp" ? "Сколько" : "± сколько"} className="w-28">
              <NumberInput value={amount} onCommit={setAmount} />
            </Field>
          )}
          {action === "coins" && (
            <Field label="Монеты" className="w-32">
              <Select value={coin} onChange={(e) => setCoin(e.target.value as Coin)} options={COIN_OPTIONS} />
            </Field>
          )}
          <Field label="За что" className="min-w-48 flex-1">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Огненное дыхание дракона"
              onKeyDown={(e) => e.key === "Enter" && reason.trim() && ids.length && void apply()}
            />
          </Field>
          <Button variant="primary" onClick={apply} disabled={busy || !ids.length || !reason.trim()}>
            Применить
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Items of one character, loaded for the "put into the stash" list. */
function useCharacterItems(characterId: string, tick: number): Item[] | null {
  const [items, setItems] = useState<{ id: string; items: Item[] } | null>(null);
  useEffect(() => {
    if (!characterId) return;
    let alive = true;
    api<{ doc: unknown }>(`/api/characters/${characterId}`)
      .then((r) => {
        const parsed = CharacterDocSchema.safeParse(r.doc);
        if (alive && parsed.success) setItems({ id: characterId, items: parsed.data.items.filter((i) => i.grant?.visibility !== "hidden") });
      })
      .catch(() => {
        if (alive) setItems({ id: characterId, items: [] });
      });
    return () => {
      alive = false;
    };
  }, [characterId, tick]);
  return items && items.id === characterId ? items.items : null;
}

export function StashTab() {
  const { id: campaignId, gm, detail, scopes } = useCampaign();
  const [data, reload] = useScopeData<{ stash: Stash }>("stash", `/api/campaigns/${campaignId}/stash`);
  const party = useParty();
  const mine = gm ? party : party.filter((c) => c.mine);
  const [who, setWho] = useState(mine[0]?.characterId ?? "");
  const ask = useAsk();
  const tick = (scopes.stash ?? 0) + (scopes.grants ?? 0);
  const items = useCharacterItems(who, tick);
  const post = (body: Record<string, unknown>, success?: string) =>
    run(() => api(`/api/campaigns/${campaignId}/stash`, { method: "POST", body }), success).then((ok) => ok && reload());

  const askQty = async (title: string, max: number) => {
    if (max <= 1) return max;
    const r = await ask.amount({ title, description: `Всего: ${max}`, direction: "gain", allowDirection: false, defaultAmount: max, integer: true });
    return r ? Math.min(max, Math.abs(r.delta)) : null;
  };

  const coins = async (coin: Coin, into: boolean) => {
    const r = await ask.amount({
      title: into ? `${COIN_LABELS[coin].full}: в сундук` : `${COIN_LABELS[coin].full}: из сундука`,
      direction: "gain",
      allowDirection: false,
      integer: true,
    });
    if (r && r.delta) await post({ action: "coins", characterId: who, coin, amount: into ? Math.abs(r.delta) : -Math.abs(r.delta) });
  };

  const others = party.filter((c) => c.characterId !== who);

  if (!data)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  const stash = data.stash;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Package className="size-4 text-accent" /> Общий сундук
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-5 gap-1.5">
            {COINS.map((c) => (
              <div key={c} className="flex flex-col items-center rounded-lg border border-line bg-panel-2 px-1 py-1.5">
                <span className="font-display text-lg font-bold tabular-nums">{stash.coins[c].toLocaleString("ru")}</span>
                <span className="text-[11px] text-muted">{COIN_LABELS[c].short}</span>
                {who && (
                  <div className="mt-1 flex gap-0.5">
                    <Button size="icon-sm" variant="ghost" aria-label="Положить" onClick={() => coins(c, true)}>
                      <ArrowDownToLine />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Взять" onClick={() => coins(c, false)} disabled={!stash.coins[c]}>
                      <ArrowUpFromLine />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {stash.items.length === 0 ? (
            <Empty title="Сундук пуст">Положите сюда добычу, которую ещё не поделили.</Empty>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              {stash.items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.name}</div>
                    <div className="text-xs text-muted">{ITEM_CATEGORY_LABELS[i.category]}</div>
                  </div>
                  <span className="text-sm tabular-nums">×{i.quantity}</span>
                  {who && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const q = await askQty(`Взять «${i.name}»`, i.quantity);
                        if (q) await post({ action: "take", characterId: who, stashId: i.id, quantity: q });
                      }}
                    >
                      <ArrowUpFromLine /> Взять
                    </Button>
                  )}
                  {gm && (
                    <Button size="icon-sm" variant="ghost" aria-label="Выбросить" onClick={() => post({ action: "discard", stashId: i.id })}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Coins className="size-4 text-muted" /> Сумка персонажа
          </span>
        }
        actions={
          mine.length > 1 ? (
            <Select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="h-8 w-44"
              options={mine.map((c) => ({ value: c.characterId, label: c.name }))}
            />
          ) : null
        }
      >
        {!mine.length ? (
          <Empty title="Нет персонажа в партии">
            {detail.me.role === "spectator" ? "Зрители не пользуются сундуком." : "Приведите персонажа, чтобы делиться добычей."}
          </Empty>
        ) : items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty title="Сумка пуста" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            {items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
                <div className="min-w-32 flex-1 truncate">{i.name}</div>
                <span className="text-sm tabular-nums">×{i.quantity}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const q = await askQty(`Положить «${i.name}» в сундук`, i.quantity);
                    if (q) await post({ action: "put", characterId: who, itemId: i.id, quantity: q });
                  }}
                >
                  <ArrowDownToLine /> В сундук
                </Button>
                {others.length > 0 && (
                  <Select
                    value=""
                    className="h-8 w-36"
                    placeholder="Отдать…"
                    onChange={async (e) => {
                      const to = e.target.value;
                      if (!to) return;
                      const q = await askQty(`Отдать «${i.name}»`, i.quantity);
                      if (q) await post({ action: "give", characterId: who, itemId: i.id, toCharacterId: to, quantity: q }, "Передано");
                    }}
                    options={others.map((c) => ({ value: c.characterId, label: c.name }))}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 flex items-center gap-1 text-xs text-faint">
          <Send className="size-3" /> Всё, что кладут и берут, пишется в журнал персонажа{gm ? "" : ", а ГМ видит уведомление"}.
        </p>
      </Panel>
    </div>
  );
}
