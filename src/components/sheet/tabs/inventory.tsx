"use client";

import { Coins, Gem, Link2, Minus, Package, Plus, Search, Sparkle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { COINS, COIN_LABELS, REST_LABELS, type Coin } from "@/lib/rules/constants";
import { ITEM_CATEGORY_LABELS, RARITY_LABELS, RARITY_TONES } from "@/lib/rules/labels";
import type { Item } from "@/lib/rules/schema";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/input";
import { Badge, Empty, Panel, Pips } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useOpenDialog } from "../dialogs-context";
import { effectSummary } from "../effects";
import { GrantBadge, MaskedText, useGrantView } from "../grant-badge";
import { makeEvent, useChange, useComputed, useDoc } from "../store";

export function ItemCharges({ item }: { item: Item }) {
  const sheet = useComputed();
  const change = useChange();
  if (!item.charges) return null;
  const max = sheet.itemCharges[item.id]?.value ?? null;
  const used = item.charges.used;
  const setUsed = (next: number) =>
    change(
      (d) => {
        const i = d.items.find((x) => x.id === item.id);
        if (i?.charges) i.charges.used = Math.max(0, next);
      },
      makeEvent("item", `${item.name}: заряды ${max !== null ? `${Math.max(0, max - next)}/${max}` : `потрачено ${next}`}`),
    );
  const reset = REST_LABELS[item.charges.reset].toLowerCase();
  if (max !== null && max <= 12) {
    return (
      <Tip content={`Заряды, восстановление: ${reset}`}>
        <div>
          <Pips total={max} available={Math.max(0, max - used)} onChange={(a) => setUsed(max - a)} tone="good" label="Заряды" />
        </div>
      </Tip>
    );
  }
  return (
    <div className="flex items-center gap-1 text-sm tabular-nums" title={`Восстановление: ${reset}`}>
      <Button size="icon-sm" variant="outline" onClick={() => setUsed(used + 1)} disabled={max !== null && used >= max} aria-label="Потратить заряд">
        <Minus />
      </Button>
      <span>{max !== null ? `${Math.max(0, max - used)}/${max}` : `−${used}`}</span>
      <Button size="icon-sm" variant="outline" onClick={() => setUsed(used - 1)} disabled={used <= 0} aria-label="Вернуть заряд">
        <Plus />
      </Button>
    </div>
  );
}

function CoinsPanel() {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const coins = COINS.filter((c) => !doc.settings.hidden.includes(`coin.${c}`));
  const totalGp = COINS.reduce((acc, c) => acc + doc.coins[c] * COIN_LABELS[c].inGp, 0);
  const edit = async (coin: Coin) => {
    const label = COIN_LABELS[coin];
    const r = await ask.amount({
      title: `${label.full} монеты`,
      description: `Сейчас: ${doc.coins[coin].toLocaleString("ru")} ${label.short}`,
      requireReason: doc.settings.requireReasons,
      unit: label.short,
    });
    if (!r) return;
    const before = doc.coins[coin];
    const after = Math.max(0, before + r.delta);
    change(
      (d) => {
        d.coins[coin] = after;
      },
      makeEvent("coins", `${label.full}: ${before.toLocaleString("ru")} → ${after.toLocaleString("ru")} (${r.delta > 0 ? "+" : ""}${r.delta} ${label.short})`, r.reason),
    );
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Coins className="size-4 text-accent" /> Монеты
        </span>
      }
      actions={<span className="text-xs text-muted tabular-nums">≈ {Math.round(totalGp * 100) / 100} зм</span>}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {coins.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => edit(c)}
            className="flex flex-col items-center rounded-xl border border-line bg-panel-2 px-2 py-2 transition-colors hover:border-accent"
            title="Получить или потратить"
          >
            <span className="font-display text-xl font-bold tabular-nums">{doc.coins[c].toLocaleString("ru")}</span>
            <span className="text-xs text-muted">{COIN_LABELS[c].full}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function ItemRow({ item }: { item: Item }) {
  const change = useChange();
  const open = useOpenDialog();
  const toggle = (key: "equipped" | "attuned", value: boolean) =>
    change(
      (d) => {
        const i = d.items.find((x) => x.id === item.id);
        if (i) i[key] = value;
      },
      makeEvent("item", `«${item.name}»: ${key === "equipped" ? (value ? "надет" : "снят") : value ? "настроен" : "настройка снята"}`),
    );
  const setQty = (qty: number) =>
    change(
      (d) => {
        const i = d.items.find((x) => x.id === item.id);
        if (i) i.quantity = Math.max(0, qty);
      },
      makeEvent("item", `«${item.name}»: количество ${item.quantity} → ${Math.max(0, qty)}`),
    );
  const activeEffects = item.effects.filter((e) => e.enabled);
  const view = useGrantView(item.grant);
  const isOn = item.attunement ? item.attuned : item.equipped;
  // A cursed item stays on once it is on (the GM is told when it happens).
  const stuck = !!item.grant?.cursed && isOn;
  if (view.hidden) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-2 last:border-b-0">
      <Tip content={stuck && item.equipped ? "Снять не получается" : item.equipped ? "Надет / в руках" : "Не надет"}>
        <div>
          <Switch checked={item.equipped} disabled={stuck && item.equipped && !item.attunement} onCheckedChange={(v) => toggle("equipped", v)} />
        </div>
      </Tip>
      <button type="button" className="min-w-40 flex-1 text-left" onClick={() => open({ kind: "item", item })}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium hover:text-accent">{item.name || "Предмет"}</span>
          {item.rarity && !view.masked && <Badge tone={RARITY_TONES[item.rarity]}>{RARITY_LABELS[item.rarity]}</Badge>}
          <GrantBadge grant={item.grant} />
          {item.link && <Link2 className="size-3 text-faint" />}
        </div>
        {view.masked ? (
          <MaskedText />
        ) : (
        <div className="flex flex-wrap gap-1 text-xs text-muted">
          <span>{ITEM_CATEGORY_LABELS[item.category]}</span>
          {item.armor && <span>· КД {item.armor.base}</span>}
          {item.weapon && <span>· {item.weapon.damage}</span>}
          {activeEffects.slice(0, 3).map((e) => (
            <span key={e.id} className="rounded bg-accent-soft px-1 text-accent">
              {effectSummary(e)}
            </span>
          ))}
          {activeEffects.length > 3 && <span>+{activeEffects.length - 3}</span>}
        </div>
        )}
      </button>
      {item.attunement && (
        <Tip content={item.attuned ? "Настроен (нажмите, чтобы снять настройку)" : "Требует настройки"}>
          <button
            type="button"
            disabled={stuck && item.attuned}
            onClick={() => toggle("attuned", !item.attuned)}
            className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs", item.attuned ? "bg-magic-soft text-magic" : "text-faint hover:text-text")}
          >
            <Sparkle className="size-3.5" /> {item.attuned ? "настроен" : "настройка"}
          </button>
        </Tip>
      )}
      <ItemCharges item={item} />
      <div className="flex items-center gap-1 text-sm tabular-nums">
        <button type="button" className="rounded p-0.5 text-faint hover:text-text" onClick={() => setQty(item.quantity - 1)} aria-label="Меньше">
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-6 text-center">{item.quantity}</span>
        <button type="button" className="rounded p-0.5 text-faint hover:text-text" onClick={() => setQty(item.quantity + 1)} aria-label="Больше">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function InventoryTab() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const open = useOpenDialog();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const items = doc.items
    .filter((i) => !query || i.name.toLowerCase().includes(query) || ITEM_CATEGORY_LABELS[i.category].toLowerCase().includes(query))
    .sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "ru"));
  const attuned = doc.items.filter((i) => i.attunement && i.attuned).length;
  const showWeight = !doc.settings.hidden.includes("item.weight");
  // Coins are left out: most tables ignore their weight (50 coins = 1 lb).
  const weight = doc.items.reduce((a, i) => a + i.weight * i.quantity, 0);
  const capacity = sheet.abilities.str.score.value * 15;

  return (
    <div className="flex flex-col gap-4">
      <CoinsPanel />
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Package className="size-4 text-muted" /> Предметы
          </span>
        }
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="primary" onClick={() => open({ kind: "item" })}>
            <Plus /> Предмет
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="h-8 pl-8" />
          </div>
          <span className={cn("flex items-center gap-1 text-xs", attuned > 3 ? "text-danger" : "text-muted")}>
            <Gem className="size-3.5" /> Настроено {attuned}/3
          </span>
          {showWeight && (
            <span className={cn("text-xs tabular-nums", weight > capacity ? "text-danger" : "text-muted")}>
              Вес {Math.round(weight * 10) / 10} / {capacity} фнт.
            </span>
          )}
        </div>
        {items.length ? (
          items.map((i) => <ItemRow key={i.id} item={i} />)
        ) : (
          <div className="p-4">
            <Empty icon={<Package />} title={query ? "Ничего не нашлось" : "Сумка пуста"}>
              {!query && "Предметы с эффектами меняют показатели сами: плащ защиты добавит +1 к КД и спасброскам, пока надет."}
            </Empty>
          </div>
        )}
      </Panel>
      <Panel title="Заметки о снаряжении">
        <RichEditor
          value={doc.inventoryNotes}
          debounceMs={1200}
          placeholder="Что лежит в сундуке, долги, заказы у кузнеца…"
          onChange={(inventoryNotes) =>
            change((d) => {
              d.inventoryNotes = inventoryNotes;
            })
          }
        />
      </Panel>
    </div>
  );
}
