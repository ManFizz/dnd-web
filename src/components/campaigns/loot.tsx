"use client";

import { Coins, Dices, Gift, Pencil, Plus, Skull, Sparkles, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TemplateRow } from "@/lib/grants";
import { LOOT_ROW_KINDS, LOOT_ROW_LABELS, type LootDraftRow, type LootItem, type LootRow, type LootTableInput, type LootTableRow } from "@/lib/loot";
import { COIN_LABELS, COINS } from "@/lib/rules/constants";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Menu, Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { CharacterPicker, useParty } from "./grants";

// Loot: weighted tables, rolled drafts and handing the loot out.

const newRow = (): LootRow => ({
  id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
  weight: 1,
  kind: "item",
  templateId: "",
  folder: "",
  tableId: "",
  quantity: "1",
  coin: "gp",
  amount: "1d6",
  curseChance: 0,
});

function RowEditor({
  row,
  onChange,
  onRemove,
  items,
  tables,
}: {
  row: LootRow;
  onChange: (r: LootRow) => void;
  onRemove: () => void;
  items: TemplateRow[];
  tables: LootTableRow[];
}) {
  const set = <K extends keyof LootRow>(k: K, v: LootRow[K]) => onChange({ ...row, [k]: v });
  const folders = [...new Set(items.map((t) => t.folder).filter(Boolean))];
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-line py-2 last:border-b-0">
      <Field label="Вес" className="w-16">
        <NumberInput value={row.weight} min={1} onCommit={(v) => set("weight", Math.max(1, v))} />
      </Field>
      <Field label="Что" className="w-52">
        <Select
          value={row.kind}
          onChange={(e) => set("kind", e.target.value as LootRow["kind"])}
          options={LOOT_ROW_KINDS.map((k) => ({ value: k, label: LOOT_ROW_LABELS[k] }))}
        />
      </Field>
      {row.kind === "item" && (
        <Field label="Предмет" className="min-w-44 flex-1">
          <Select
            value={row.templateId}
            onChange={(e) => set("templateId", e.target.value)}
            placeholder="Из библиотеки"
            options={items.map((t) => ({ value: t.id, label: t.name, group: t.folder || "Без папки" }))}
          />
        </Field>
      )}
      {row.kind === "folder" && (
        <Field label="Папка библиотеки" className="min-w-44 flex-1">
          <Select
            value={row.folder}
            onChange={(e) => set("folder", e.target.value)}
            placeholder="Выберите"
            options={folders.map((f) => ({ value: f, label: f }))}
          />
        </Field>
      )}
      {row.kind === "table" && (
        <Field label="Таблица" className="min-w-44 flex-1">
          <Select
            value={row.tableId}
            onChange={(e) => set("tableId", e.target.value)}
            placeholder="Выберите"
            options={tables.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
      )}
      {row.kind === "coins" && (
        <>
          <Field label="Монеты" className="w-32">
            <Select
              value={row.coin}
              onChange={(e) => set("coin", e.target.value as LootRow["coin"])}
              options={COINS.map((c) => ({ value: c, label: COIN_LABELS[c].full }))}
            />
          </Field>
          <Field label="Сколько" className="w-32">
            <Input value={row.amount} onChange={(e) => set("amount", e.target.value)} className="font-mono" placeholder="3d6*10" />
          </Field>
        </>
      )}
      {(row.kind === "item" || row.kind === "folder" || row.kind === "table") && (
        <Field label={row.kind === "table" ? "Бросков" : "Кол-во"} className="w-24">
          <Input value={row.quantity} onChange={(e) => set("quantity", e.target.value)} className="font-mono" placeholder="1d4" />
        </Field>
      )}
      {(row.kind === "item" || row.kind === "folder") && (
        <Field label="Проклят, %" className="w-24">
          <NumberInput value={row.curseChance} min={0} max={100} onCommit={(v) => set("curseChance", Math.min(100, Math.max(0, v)))} />
        </Field>
      )}
      <Button size="icon-sm" variant="ghost" className="mb-1" aria-label="Убрать строку" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function TableDialog({
  initial,
  id,
  items,
  tables,
  onClose,
}: {
  initial: LootTableInput;
  id: string | null;
  items: TemplateRow[];
  tables: LootTableRow[];
  onClose: () => void;
}) {
  const { id: campaignId } = useCampaign();
  const [t, setT] = useState(initial);
  const [busy, setBusy] = useState(false);
  const total = t.rows.reduce((a, r) => a + r.weight, 0);
  const save = async () => {
    setBusy(true);
    const ok = await run(() =>
      api(id ? `/api/campaigns/${campaignId}/loot/tables/${id}` : `/api/campaigns/${campaignId}/loot/tables`, { method: id ? "PUT" : "POST", body: t }),
    );
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={id ? `Таблица «${initial.name}»` : "Новая таблица"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !t.name.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Название" required>
            <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Логово гоблинов" />
          </Field>
          <Field label="Папка">
            <Input value={t.folder} onChange={(e) => setT({ ...t, folder: e.target.value })} />
          </Field>
          <Field label="Бросков за раз" hint="Число или формула: 1d4">
            <Input value={t.rolls} onChange={(e) => setT({ ...t, rolls: e.target.value })} className="font-mono" />
          </Field>
        </div>
        <div>
          {t.rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-faint tabular-nums">{total ? Math.round((r.weight / total) * 100) : 0}%</span>
              <div className="min-w-0 flex-1">
                <RowEditor
                  row={r}
                  items={items}
                  tables={tables.filter((x) => x.id !== id)}
                  onChange={(next) => setT({ ...t, rows: t.rows.map((x, j) => (j === i ? next : x)) })}
                  onRemove={() => setT({ ...t, rows: t.rows.filter((_, j) => j !== i) })}
                />
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="self-start" onClick={() => setT({ ...t, rows: [...t.rows, newRow()] })}>
          <Plus /> Строка
        </Button>
        {!items.length && <p className="text-xs text-faint">Предметы для таблиц берутся из библиотеки кампании: сначала создайте их там.</p>}
      </div>
    </Modal>
  );
}

function DraftCard({ draft }: { draft: LootDraftRow }) {
  const { id: campaignId } = useCampaign();
  const party = useParty();
  const ask = useAsk();
  const [data, setData] = useState(draft.data);
  const [split, setSplit] = useState<string[]>(party.map((c) => c.characterId));
  const [reason, setReason] = useState(draft.title);
  const url = `/api/campaigns/${campaignId}/loot/drafts/${draft.id}`;
  const dirty = JSON.stringify(data) !== JSON.stringify(draft.data);
  const setItem = (i: number, next: LootItem) => setData({ ...data, items: data.items.map((x, j) => (j === i ? next : x)) });
  const coinsTotal = COINS.filter((c) => data.coins[c] > 0);
  const assignees = [{ value: "stash", label: "В общий сундук" }, ...party.map((c) => ({ value: c.characterId, label: c.name }))];

  const distribute = async () => {
    if (dirty && !(await run(() => api(url, { method: "POST", body: { action: "save", title: draft.title, data } })))) return;
    await run(() => api(url, { method: "POST", body: { action: "distribute", split, reason } }), "Добыча роздана");
  };
  const discard = async () => {
    if (await ask.confirm({ title: `Выбросить «${draft.title}»?`, confirmLabel: "Выбросить", danger: true }))
      await run(() => api(url, { method: "POST", body: { action: "discard" } }));
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-accent" /> {draft.title}
        </span>
      }
      actions={
        <Button size="icon-sm" variant="ghost" aria-label="Выбросить" onClick={discard}>
          <Trash2 />
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {data.items.length === 0 && coinsTotal.length === 0 && <p className="text-sm text-muted">Выпало пусто.</p>}
        {data.items.map((it, i) => (
          <div key={it.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-32 flex-1 font-medium">
              {it.name}
              {it.cursed && (
                <Badge tone="danger" className="ml-1.5">
                  <Skull className="size-3" /> проклят
                </Badge>
              )}
            </span>
            <NumberInput value={it.quantity} min={0} onCommit={(q) => setItem(i, { ...it, quantity: q })} className="w-20" />
            <Select
              value={it.assignee}
              onChange={(e) => setItem(i, { ...it, assignee: e.target.value })}
              placeholder="Кому?"
              options={assignees}
              className="w-44"
            />
            <Button size="icon-sm" variant="ghost" aria-label="Убрать" onClick={() => setData({ ...data, items: data.items.filter((_, j) => j !== i) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {coinsTotal.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Coins className="size-4 text-accent" />
              {COINS.map((c) => (
                <label key={c} className="flex items-center gap-1">
                  <NumberInput value={data.coins[c]} min={0} onCommit={(v) => setData({ ...data, coins: { ...data.coins, [c]: v } })} className="w-20" />
                  {COIN_LABELS[c].short}
                </label>
              ))}
            </div>
            <div className="text-xs text-muted">Поровну между отмеченными, остаток в общий сундук:</div>
            <CharacterPicker value={split} onChange={setSplit} />
          </div>
        )}
        <details className="text-xs text-faint">
          <summary className="cursor-pointer">Как выпало</summary>
          <pre className="mt-1 font-sans whitespace-pre-wrap">{data.log.join("\n")}</pre>
        </details>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="За что (в журнал)" className="min-w-48 flex-1">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={distribute} disabled={!reason.trim() || data.items.some((i) => !i.assignee)}>
            <Gift /> Раздать
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function LootTab() {
  const { id: campaignId } = useCampaign();
  const [tablesData] = useScopeData<{ tables: LootTableRow[] }>("loot", `/api/campaigns/${campaignId}/loot/tables`);
  const [draftsData] = useScopeData<{ drafts: LootDraftRow[] }>("loot", `/api/campaigns/${campaignId}/loot/drafts`);
  const [lib] = useScopeData<{ templates: TemplateRow[] }>("library", `/api/campaigns/${campaignId}/library`);
  const [editing, setEditing] = useState<{ id: string | null; t: LootTableInput } | null>(null);
  const [times, setTimes] = useState<Record<string, number>>({});
  const ask = useAsk();
  const tables = tablesData?.tables ?? null;
  const items = (lib?.templates ?? []).filter((t) => t.kind === "item");

  const roll = (t: LootTableRow) =>
    run(() => api(`/api/campaigns/${campaignId}/loot/drafts`, { method: "POST", body: { tableId: t.id, times: times[t.id] ?? 1 } }), "Брошено");
  const remove = async (t: LootTableRow) => {
    if (await ask.confirm({ title: `Удалить таблицу «${t.name}»?`, confirmLabel: "Удалить", danger: true }))
      await run(() => api(`/api/campaigns/${campaignId}/loot/tables/${t.id}`, { method: "DELETE" }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Table2 className="size-4 text-accent" /> Таблицы
          </span>
        }
        actions={
          <Menu
            trigger={
              <Button size="sm" variant="primary">
                <Plus /> Таблица
              </Button>
            }
            items={[
              { label: "Новая таблица", onSelect: () => setEditing({ id: null, t: { name: "", folder: "", rolls: "1", rows: [newRow()] } }) },
              {
                label: "Стартовые: монеты по опасности",
                onSelect: () =>
                  void run(() => api(`/api/campaigns/${campaignId}/loot/tables`, { method: "POST", body: { starter: true } }), "Таблицы добавлены"),
              },
            ]}
          />
        }
      >
        {tables === null ? (
          <Spinner />
        ) : tables.length === 0 ? (
          <Empty title="Таблиц нет">
            Таблица: строки с весами. Строка даёт предмет из библиотеки, случайный предмет из папки, монеты по формуле или бросок по другой таблице.
          </Empty>
        ) : (
          <div className="flex flex-col">
            {tables.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0">
                <div className="min-w-32 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted">
                    {t.folder ? `${t.folder} · ` : ""}строк: {t.rows.length}, бросков: {t.rolls}
                  </div>
                </div>
                <NumberInput
                  value={times[t.id] ?? 1}
                  min={1}
                  max={50}
                  onCommit={(v) => setTimes({ ...times, [t.id]: Math.max(1, Math.min(50, v)) })}
                  className="w-16"
                />
                <Button size="sm" variant="subtle" onClick={() => roll(t)}>
                  <Dices /> Бросить
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Изменить" onClick={() => setEditing({ id: t.id, t })}>
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={() => remove(t)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="flex flex-col gap-4">
        {!draftsData ? (
          <Spinner />
        ) : draftsData.drafts.length === 0 ? (
          <Empty icon={<Sparkles />} title="Нерозданной добычи нет">
            Бросьте таблицу: выпавшее появится здесь, и его можно раздать персонажам, положить в сундук или поделить монеты поровну.
          </Empty>
        ) : (
          draftsData.drafts.map((d) => <DraftCard key={`${d.id}:${JSON.stringify(d.data).length}`} draft={d} />)
        )}
      </div>
      {editing && tables && <TableDialog initial={editing.t} id={editing.id} items={items} tables={tables} onClose={() => setEditing(null)} />}
    </div>
  );
}
