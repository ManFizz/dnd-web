"use client";

import { Pencil, Plus, ShoppingBag, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TemplateRow } from "@/lib/grants";
import { COIN_LABELS, COINS } from "@/lib/rules/constants";
import { formatPrice, type ShopInput, type ShopItem, type ShopRow } from "@/lib/shop";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select, Switch, Textarea } from "@/components/ui/input";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { useParty } from "./grants";

// Merchants: the GM stocks a shop from the library; players buy with the
// coins on their sheet and get the item with a journal entry.

const itemId = () => `si_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function ShopEditor({ initial, id, onClose }: { initial: ShopInput; id: string | null; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const [lib] = useScopeData<{ templates: TemplateRow[] }>("library", `/api/campaigns/${campaignId}/library`);
  const [s, setS] = useState(initial);
  const items = (lib?.templates ?? []).filter((t) => t.kind === "item");
  const setItem = (i: number, next: ShopItem) => setS({ ...s, items: s.items.map((x, j) => (j === i ? next : x)) });
  const save = async () => {
    const ok = await run(() =>
      api(id ? `/api/campaigns/${campaignId}/shops/${id}` : `/api/campaigns/${campaignId}/shops`, { method: id ? "PUT" : "POST", body: s }),
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={id ? initial.name : "Новая лавка"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={!s.name.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Название" className="min-w-48 flex-1">
            <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Лавка Блёркина" />
          </Field>
          <Switch checked={s.open} onCheckedChange={(open) => setS({ ...s, open })} label="Открыта для игроков" />
        </div>
        <Field label="Описание">
          <Textarea value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} className="min-h-12" />
        </Field>
        {s.items.map((it, i) => (
          <div key={it.id} className="flex flex-wrap items-end gap-2 border-b border-line pb-2">
            <Field label="Товар" className="min-w-44 flex-1">
              <Select
                value={it.templateId}
                onChange={(e) => setItem(i, { ...it, templateId: e.target.value })}
                placeholder="Из библиотеки"
                options={items.map((t) => ({ value: t.id, label: t.name, group: t.folder || "Без папки" }))}
              />
            </Field>
            <Field label="Цена" className="w-24">
              <NumberInput value={it.price} min={0} integer={false} onCommit={(price) => setItem(i, { ...it, price })} />
            </Field>
            <Field label="Монеты" className="w-24">
              <Select
                value={it.coin}
                onChange={(e) => setItem(i, { ...it, coin: e.target.value as ShopItem["coin"] })}
                options={COINS.map((c) => ({ value: c, label: COIN_LABELS[c].short }))}
              />
            </Field>
            <Field label="В наличии" hint="Пусто: сколько угодно" className="w-28">
              <Input
                value={it.stock === null ? "" : String(it.stock)}
                inputMode="numeric"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setItem(i, { ...it, stock: v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)) });
                }}
              />
            </Field>
            <Button
              size="icon-sm"
              variant="ghost"
              className="mb-6"
              aria-label="Убрать"
              onClick={() => setS({ ...s, items: s.items.filter((_, j) => j !== i) })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setS({ ...s, items: [...s.items, { id: itemId(), templateId: "", name: "", price: 1, coin: "gp", stock: null }] })}
        >
          <Plus /> Товар
        </Button>
        {!items.length && <p className="text-xs text-faint">Товары берутся из библиотеки кампании: сначала создайте предметы там.</p>}
      </div>
    </Modal>
  );
}

function BuyButton({ shop, item }: { shop: ShopRow; item: ShopItem }) {
  const { id: campaignId, gm } = useCampaign();
  const party = useParty();
  const mine = gm ? party : party.filter((c) => c.mine);
  const ask = useAsk();
  const [who, setWho] = useState(mine[0]?.characterId ?? "");
  if (!mine.length) return null;
  const buy = async () => {
    const r = await ask.amount({
      title: `Купить «${item.name}»`,
      description: `Цена: ${formatPrice(item.price, item.coin)} за штуку`,
      direction: "gain",
      allowDirection: false,
      defaultAmount: 1,
      integer: true,
      noReason: true,
      confirmLabel: "Купить",
    });
    if (!r) return;
    const quantity = Math.max(1, Math.abs(r.delta));
    await run(
      () => api(`/api/campaigns/${campaignId}/shops/${shop.id}/buy`, { method: "POST", body: { itemId: item.id, characterId: who, quantity } }),
      `Куплено: ${item.name} ×${quantity}`,
    );
  };
  return (
    <div className="flex items-center gap-1">
      {mine.length > 1 && (
        <Select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="h-8 w-32"
          options={mine.map((c) => ({ value: c.characterId, label: c.name }))}
        />
      )}
      <Button size="sm" variant="subtle" onClick={buy} disabled={item.stock === 0}>
        <ShoppingBag /> Купить
      </Button>
    </div>
  );
}

export function ShopTab() {
  const { id: campaignId, gm } = useCampaign();
  const [data] = useScopeData<{ shops: ShopRow[] }>("shop", `/api/campaigns/${campaignId}/shops`);
  const [editing, setEditing] = useState<{ id: string | null; s: ShopInput } | null>(null);
  const ask = useAsk();
  if (!data) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      {gm && (
        <Button variant="primary" className="self-start" onClick={() => setEditing({ id: null, s: { name: "", description: "", open: false, items: [] } })}>
          <Plus /> Лавка
        </Button>
      )}
      {data.shops.length === 0 ? (
        <Empty icon={<Store />} title={gm ? "Лавок нет" : "Лавки закрыты"}>
          {gm
            ? "Соберите лавку из предметов библиотеки и откройте её, когда партия придёт в город."
            : "Когда ГМ откроет лавку, здесь можно будет купить снаряжение."}
        </Empty>
      ) : (
        data.shops.map((shop) => (
          <Panel
            key={shop.id}
            title={
              <span className="flex items-center gap-2">
                <Store className="size-4 text-accent" /> {shop.name}
                {gm && <Badge tone={shop.open ? "good" : "neutral"}>{shop.open ? "открыта" : "закрыта"}</Badge>}
              </span>
            }
            actions={
              gm && (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label="Изменить" onClick={() => setEditing({ id: shop.id, s: shop })}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Удалить"
                    onClick={async () => {
                      if (await ask.confirm({ title: `Удалить «${shop.name}»?`, confirmLabel: "Удалить", danger: true }))
                        await run(() => api(`/api/campaigns/${campaignId}/shops/${shop.id}`, { method: "DELETE" }));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )
            }
            bodyClassName="p-0"
          >
            {shop.description && <p className="border-b border-line px-4 py-2 text-sm whitespace-pre-line text-muted">{shop.description}</p>}
            {shop.items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">Прилавок пуст.</p>
            ) : (
              shop.items.map((it) => (
                <div key={it.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 last:border-b-0">
                  <span className="min-w-32 flex-1 font-medium">{it.name}</span>
                  <span className="text-sm tabular-nums">{formatPrice(it.price, it.coin)}</span>
                  {it.stock !== null && <Badge tone={it.stock ? "neutral" : "danger"}>{it.stock ? `осталось ${it.stock}` : "нет"}</Badge>}
                  <BuyButton shop={shop} item={it} />
                </div>
              ))
            )}
          </Panel>
        ))
      )}
      {editing && <ShopEditor initial={editing.s} id={editing.id} onClose={() => setEditing(null)} />}
    </div>
  );
}
