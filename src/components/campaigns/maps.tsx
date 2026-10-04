"use client";

import {
  ChevronRight,
  CloudFog,
  Eye,
  EyeOff,
  Hand,
  ImagePlus,
  Map as MapIcon,
  MapPin as PinIcon,
  MonitorPlay,
  Plus,
  Ruler,
  Settings2,
  Sparkles,
  Swords,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { EncounterRow } from "@/lib/encounter";
import { MAP_KIND_LABELS, MAP_KINDS, PIN_COLORS, TOKEN_COLORS, type MapAction, type MapInput, type MapPin, type MapRow, type MapToken } from "@/lib/maps";
import { cn } from "@/lib/cn";
import { IMAGE_TYPES } from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select, Switch, Textarea } from "@/components/ui/input";
import { Badge, Empty, Segmented, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { uploadImage } from "./handouts";
import { MapView, type MapTool } from "./map-view";

// Maps tab: the GM keeps a tree of maps (world → city → dungeon → battle),
// reveals them and the fog step by step; players see what is revealed on their
// own devices and move their own tokens.

export type MapsData = { maps: MapRow[]; presentMapId: string | null; gm: boolean };

export const mapImageUrl = (campaignId: string, m: MapRow, asPlayer: boolean) =>
  m.imageId ? `/api/campaigns/${campaignId}/maps/${m.id}/image?f=${m.imageId}${asPlayer ? `&view=player&k=${m.fogKey}` : ""}` : null;

const pid = () => `pn_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const PIN_COLOR_LABELS: Record<MapPin["color"], string> = { accent: "Золотая", danger: "Красная", good: "Зелёная", info: "Синяя", magic: "Фиолетовая" };

function emptyMap(parentId: string | null): MapInput {
  return {
    name: "",
    kind: "place",
    parentId,
    imageId: null,
    width: 0,
    height: 0,
    revealed: false,
    grid: { show: false, size: 70, offsetX: 0, offsetY: 0, feet: 5 },
    fog: { enabled: false, ops: [] },
    pins: [],
    order: 0,
  };
}

function MapSettings({ initial, id, maps, onClose }: { initial: MapInput; id: string | null; maps: MapRow[]; onClose: (newId?: string) => void }) {
  const { id: campaignId } = useCampaign();
  const [m, setM] = useState(initial);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const grid = m.grid;
  const setGrid = (patch: Partial<MapInput["grid"]>) => setM({ ...m, grid: { ...grid, ...patch } });
  const save = async () => {
    setBusy(true);
    try {
      if (id) {
        await api(`/api/campaigns/${campaignId}/maps/${id}`, { method: "PUT", body: m });
        onClose();
      } else {
        const r = await api<{ id: string }>(`/api/campaigns/${campaignId}/maps`, { method: "POST", body: m });
        onClose(r.id);
      }
    } catch (e) {
      await run(() => Promise.reject(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={id ? initial.name : "Новая карта"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose()}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !m.name.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Название" className="min-w-48 flex-1">
            <Input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Долина Ледяного Ветра" />
          </Field>
          <Segmented
            value={m.kind}
            onChange={(kind) => setM({ ...m, kind, grid: kind === "combat" ? { ...grid, show: true } : grid })}
            options={MAP_KINDS.map((k) => ({ value: k, label: MAP_KIND_LABELS[k] }))}
          />
        </div>
        <Field label="Внутри карты" hint="Например, город внутри карты мира: на родительской карте можно поставить метку-ссылку">
          <Select
            value={m.parentId ?? ""}
            onChange={(e) => setM({ ...m, parentId: e.target.value || null })}
            placeholder="Нет, это верхний уровень"
            options={maps.filter((x) => x.id !== id).map((x) => ({ value: x.id, label: x.name }))}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> {m.imageId ? "Заменить картинку" : "Загрузить картинку"}
          </Button>
          {m.imageId && <Badge tone="good">картинка загружена</Badge>}
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="hidden"
            aria-label="Картинка карты"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              const imageId = await uploadImage(campaignId, f);
              setBusy(false);
              if (imageId) setM((x) => ({ ...x, imageId, name: x.name || f.name.replace(/\.[^.]+$/, "") }));
            }}
          />
          {busy && <Spinner />}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <Switch checked={grid.show} onCheckedChange={(show) => setGrid({ show })} label="Сетка" />
          {grid.show && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Клетка, px" className="w-24">
                <NumberInput value={grid.size} min={4} max={1000} integer={false} onCommit={(size) => setGrid({ size: Math.max(4, size) })} />
              </Field>
              <Field label="Сдвиг X" className="w-24">
                <NumberInput value={grid.offsetX} integer={false} onCommit={(offsetX) => setGrid({ offsetX })} />
              </Field>
              <Field label="Сдвиг Y" className="w-24">
                <NumberInput value={grid.offsetY} integer={false} onCommit={(offsetY) => setGrid({ offsetY })} />
              </Field>
              <Field label="Футов в клетке" className="w-28">
                <NumberInput value={grid.feet} min={0} onCommit={(feet) => setGrid({ feet })} />
              </Field>
            </div>
          )}
          <Switch checked={m.fog.enabled} onCheckedChange={(enabled) => setM({ ...m, fog: { ...m.fog, enabled } })} label="Туман войны" />
          <Switch checked={m.revealed} onCheckedChange={(revealed) => setM({ ...m, revealed })} label="Игроки видят карту" />
        </div>
      </div>
    </Modal>
  );
}

function PinDialog({
  pin,
  maps,
  gm,
  onSave,
  onDelete,
  onOpenMap,
  onClose,
}: {
  pin: MapPin;
  maps: MapRow[];
  gm: boolean;
  onSave: (p: MapPin) => void;
  onDelete: () => void;
  onOpenMap: (id: string) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState(pin);
  const linked = pin.mapId ? maps.find((m) => m.id === pin.mapId) : null;
  if (!gm) {
    return (
      <Modal
        open
        onOpenChange={(v) => !v && onClose()}
        title={pin.label || "Метка"}
        size="sm"
        footer={
          linked && (
            <Button variant="primary" onClick={() => onOpenMap(linked.id)}>
              <MapIcon /> Открыть «{linked.name}»
            </Button>
          )
        }
      >
        {pin.note ? <p className="text-sm whitespace-pre-line">{pin.note}</p> : <p className="text-sm text-muted">Без описания.</p>}
      </Modal>
    );
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Метка"
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={onDelete}>
            <Trash2 /> Удалить
          </Button>
          {linked && (
            <Button variant="outline" onClick={() => onOpenMap(linked.id)}>
              <MapIcon /> Открыть
            </Button>
          )}
          <Button variant="primary" onClick={() => onSave(p)}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Подпись">
          <Input autoFocus value={p.label} onChange={(e) => setP({ ...p, label: e.target.value })} placeholder="Таверна «Пьяный гоблин»" />
        </Field>
        <Field label="Описание">
          <Textarea value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} className="min-h-20" />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Цвет" className="w-36">
            <Select
              value={p.color}
              onChange={(e) => setP({ ...p, color: e.target.value as MapPin["color"] })}
              options={PIN_COLORS.map((c) => ({ value: c, label: PIN_COLOR_LABELS[c] }))}
            />
          </Field>
          <Field label="Ведёт на карту" className="min-w-44 flex-1">
            <Select
              value={p.mapId ?? ""}
              onChange={(e) => setP({ ...p, mapId: e.target.value || null })}
              placeholder="Никуда"
              options={maps.map((m) => ({ value: m.id, label: m.name }))}
            />
          </Field>
        </div>
        <Checkbox label="Спрятана от игроков" checked={p.hidden} onChange={(e) => setP({ ...p, hidden: e.target.checked })} />
      </div>
    </Modal>
  );
}

function TokenDialog({ token, onSave, onDelete, onClose }: { token: MapToken; onSave: (t: MapToken) => void; onDelete: () => void; onClose: () => void }) {
  const [t, setT] = useState(token);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={token.name}
      size="sm"
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={onDelete}>
            <Trash2 /> Убрать
          </Button>
          <Button variant="primary" onClick={() => onSave(t)}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Имя">
          <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        </Field>
        <Field label="Размер, клеток" className="w-32">
          <NumberInput value={t.size} min={0.25} max={10} integer={false} onCommit={(size) => setT({ ...t, size: Math.max(0.25, Math.min(10, size)) })} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {TOKEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Цвет ${c}`}
              onClick={() => setT({ ...t, color: c })}
              className={cn("size-7 rounded-full border-2", t.color === c ? "border-text" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
        {t.kind !== "pc" && <Checkbox label="Спрятана от игроков" checked={t.hidden} onChange={(e) => setT({ ...t, hidden: e.target.checked })} />}
      </div>
    </Modal>
  );
}

function NewToken({ onAdd, onClose }: { onAdd: (t: Pick<MapToken, "name" | "kind" | "size" | "color" | "hidden">) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MapToken["kind"]>("monster");
  const [hidden, setHidden] = useState(false);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Новая фишка"
      size="sm"
      footer={
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={() => onAdd({ name: name.trim(), kind, size: 1, color: kind === "monster" ? "#c2410c" : "#475569", hidden })}
        >
          Добавить
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Имя">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "monster", label: "Монстр" },
            { value: "npc", label: "НИП" },
          ]}
        />
        <Checkbox label="Спрятана от игроков" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
      </div>
    </Modal>
  );
}

/** Breadcrumbs from the top map down to the current one. */
function Trail({ maps, current, onOpen }: { maps: MapRow[]; current: MapRow; onOpen: (id: string) => void }) {
  const chain: MapRow[] = [];
  const byId = new Map(maps.map((m) => [m.id, m]));
  for (let m: MapRow | undefined = current; m && chain.length < 20; m = m.parentId ? byId.get(m.parentId) : undefined) chain.unshift(m);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      {chain.map((m, i) => (
        <span key={m.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 text-faint" />}
          {m.id === current.id ? (
            <span className="font-display text-lg font-bold">{m.name}</span>
          ) : (
            <button type="button" className="text-muted hover:text-text" onClick={() => onOpen(m.id)}>
              {m.name}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function MapList({
  maps,
  current,
  presentMapId,
  gm,
  onOpen,
}: {
  maps: MapRow[];
  current: string | null;
  presentMapId: string | null;
  gm: boolean;
  onOpen: (id: string) => void;
}) {
  const ids = new Set(maps.map((m) => m.id));
  const children = (parent: string | null) => maps.filter((m) => (parent ? m.parentId === parent : !m.parentId || !ids.has(m.parentId)));
  const render = (parent: string | null, depth: number): React.ReactNode =>
    children(parent).map((m) => (
      <div key={m.id}>
        <button
          type="button"
          onClick={() => onOpen(m.id)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-panel-2",
            m.id === current && "bg-accent-soft font-medium text-accent",
          )}
          style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
        >
          {m.kind === "combat" ? <Swords className="size-3.5 shrink-0" /> : <MapIcon className="size-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{m.name}</span>
          {m.id === presentMapId && <MonitorPlay className="size-3.5 shrink-0 text-good" aria-label="На экране" />}
          {gm && !m.revealed && <EyeOff className="size-3.5 shrink-0 text-faint" aria-label="Скрыта" />}
        </button>
        {depth < 6 && render(m.id, depth + 1)}
      </div>
    ));
  return <nav className="flex flex-col gap-0.5">{render(null, 0)}</nav>;
}

export function MapsTab() {
  const { id: campaignId, gm, detail } = useCampaign();
  const [data] = useScopeData<MapsData>("maps", `/api/campaigns/${campaignId}/maps`);
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [tool, setTool] = useState<MapTool>("pan");
  const [settings, setSettings] = useState<{ id: string | null; m: MapInput } | null>(null);
  const [pin, setPin] = useState<MapPin | null>(null);
  const [token, setToken] = useState<MapToken | null>(null);
  const [adding, setAdding] = useState(false);
  const [encounters] = useScopeData<{ encounters?: EncounterRow[] }>("encounter", gm ? `/api/campaigns/${campaignId}/encounters` : null);
  // Moves show at once; the next load from the server replaces them.
  const [moved, setMoved] = useState<{ data: MapsData | null; at: Record<string, { x: number; y: number }> }>({ data: null, at: {} });
  const ask = useAsk();

  // Players follow the map the GM shows until they pick another one.
  const [seenPresent, setSeenPresent] = useState<string | null>(null);
  const presentMapId = data?.presentMapId ?? null;
  if (presentMapId !== seenPresent) {
    setSeenPresent(presentMapId);
    if (presentMapId && !gm) {
      setFollow(true);
      setSelected(presentMapId);
    }
  }

  if (!data) return <Spinner />;
  const maps = data.maps;
  const current = maps.find((m) => m.id === selected) ?? (follow && !gm ? maps.find((m) => m.id === presentMapId) : null) ?? maps[0] ?? null;
  const mine = detail.characters.filter((c) => c.mine && c.status === "accepted").map((c) => c.characterId);
  const offsets = moved.data === data ? moved.at : {};
  const shown = current && { ...current, tokens: current.tokens.map((t) => (offsets[t.id] ? { ...t, ...offsets[t.id] } : t)) };

  const open = (id: string) => {
    setSelected(id);
    setFollow(false);
    setTool("pan");
  };
  const act = (body: MapAction) => run(() => api(`/api/campaigns/${campaignId}/maps/${current!.id}`, { method: "POST", body }));
  const present = (mapId: string | null) =>
    run(() => api(`/api/campaigns/${campaignId}/maps/present`, { method: "POST", body: { mapId } }), mapId ? "Карта на общем экране" : undefined);
  const activeEncounter = (encounters?.encounters ?? []).find((e) => e.status !== "done");

  const toolbar = gm
    ? [
        { value: "pan" as const, label: <Hand className="size-4" />, title: "Двигать карту и фишки" },
        { value: "reveal" as const, label: <Sparkles className="size-4" />, title: "Открыть туман: выделите область" },
        { value: "hide" as const, label: <CloudFog className="size-4" />, title: "Скрыть туманом: выделите область" },
        { value: "pin" as const, label: <PinIcon className="size-4" />, title: "Поставить метку" },
        { value: "measure" as const, label: <Ruler className="size-4" />, title: "Линейка" },
      ]
    : [
        { value: "pan" as const, label: <Hand className="size-4" />, title: "Двигать карту и свою фишку" },
        { value: "measure" as const, label: <Ruler className="size-4" />, title: "Линейка" },
      ];

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {gm && (
          <Button variant="primary" onClick={() => setSettings({ id: null, m: emptyMap(current?.id ?? null) })}>
            <Plus /> Карта
          </Button>
        )}
        {maps.length > 0 && <MapList maps={maps} current={current?.id ?? null} presentMapId={presentMapId} gm={gm} onOpen={open} />}
        <Link href={`/campaigns/${campaignId}/present`} target="_blank" className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <MonitorPlay className="size-4" /> Общий экран
        </Link>
      </div>

      {!current || !shown ? (
        <Empty icon={<MapIcon />} title={gm ? "Карт пока нет" : "ГМ ещё не показал ни одной карты"}>
          {gm
            ? "Загрузите карту мира, города или поля боя. Игроки увидят её, когда вы её откроете, а туман можно снимать по кусочку."
            : "Когда ГМ откроет карту, она появится здесь и на общем экране."}
        </Empty>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Trail maps={maps} current={current} onOpen={open} />
            <Badge>{MAP_KIND_LABELS[current.kind]}</Badge>
            {gm && !current.revealed && <Badge tone="magic">скрыта от игроков</Badge>}
            {!gm && presentMapId && current.id !== presentMapId && (
              <Button size="xs" variant="subtle" onClick={() => open(presentMapId)}>
                <MonitorPlay /> К карте ГМа
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={tool} onChange={setTool} options={toolbar} />
            {gm && (
              <>
                {current.fog.enabled && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => act({ action: "undoFog" })} disabled={!current.fog.ops.length}>
                      <Undo2 /> Туман
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (await ask.confirm({ title: "Снова закрыть всю карту туманом?", confirmLabel: "Закрыть" }))
                          await act({ action: "fogAll", reveal: false });
                      }}
                    >
                      <CloudFog /> Всё в туман
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => act({ action: "addParty" })}>
                  <Users /> Партия
                </Button>
                {activeEncounter && (
                  <Button size="sm" variant="outline" onClick={() => act({ action: "addEncounter", encounterId: activeEncounter.id })}>
                    <Swords /> Из боя
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                  <Plus /> Фишка
                </Button>
                <div className="flex-1" />
                {presentMapId === current.id ? (
                  <Button size="sm" variant="ghost" onClick={() => present(null)}>
                    <MonitorPlay /> Убрать с экрана
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => present(current.id)}>
                    <MonitorPlay /> Показать всем
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={current.revealed ? "Спрятать от игроков" : "Открыть игрокам"}
                  onClick={() =>
                    run(() => api(`/api/campaigns/${campaignId}/maps/${current.id}`, { method: "PUT", body: { ...current, revealed: !current.revealed } }))
                  }
                >
                  {current.revealed ? <Eye /> : <EyeOff />}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Настройки карты" onClick={() => setSettings({ id: current.id, m: current })}>
                  <Settings2 />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Удалить карту"
                  onClick={async () => {
                    if (
                      await ask.confirm({
                        title: `Удалить карту «${current.name}»?`,
                        description: "Вложенные карты останутся.",
                        confirmLabel: "Удалить",
                        danger: true,
                      })
                    ) {
                      await run(() => api(`/api/campaigns/${campaignId}/maps/${current.id}`, { method: "DELETE" }));
                      setSelected(null);
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
          <MapView
            map={shown}
            imageUrl={mapImageUrl(campaignId, current, !gm)}
            gm={gm}
            tool={tool}
            className="h-[70vh] min-h-80"
            canMove={(t) => gm || (!!t.characterId && mine.includes(t.characterId))}
            onMove={(t, p) => {
              setMoved((m) => ({ data, at: { ...(m.data === data ? m.at : {}), [t.id]: p } }));
              void act({ action: "move", tokenId: t.id, x: p.x, y: p.y });
            }}
            onFog={(op) => void act({ action: "fog", op })}
            onPin={(p) => setPin({ id: pid(), ...p, label: "", note: "", color: "accent", hidden: !current.revealed, mapId: null })}
            onPinClick={setPin}
            onTokenClick={(t) => gm && setToken(t)}
          />
          {gm && current.fog.enabled && tool === "pan" && (
            <p className="text-xs text-faint">Туман для вас полупрозрачный, игроки видят его сплошным. Выберите «Открыть туман» и выделите область.</p>
          )}
        </div>
      )}

      {settings && (
        <MapSettings
          initial={settings.m}
          id={settings.id}
          maps={maps}
          onClose={(newId) => {
            setSettings(null);
            if (newId) open(newId);
          }}
        />
      )}
      {pin && current && (
        <PinDialog
          pin={pin}
          maps={maps}
          gm={gm}
          onClose={() => setPin(null)}
          onOpenMap={(id) => {
            setPin(null);
            open(id);
          }}
          onSave={async (p) => {
            if (await act({ action: "pin", pin: p })) setPin(null);
          }}
          onDelete={async () => {
            if (await act({ action: "removePin", pinId: pin.id })) setPin(null);
          }}
        />
      )}
      {token && current && (
        <TokenDialog
          token={token}
          onClose={() => setToken(null)}
          onSave={async (t) => {
            if (await act({ action: "updateToken", token: t })) setToken(null);
          }}
          onDelete={async () => {
            if (await act({ action: "removeToken", tokenId: token.id })) setToken(null);
          }}
        />
      )}
      {adding && current && (
        <NewToken
          onClose={() => setAdding(false)}
          onAdd={async (t) => {
            const at = { x: (current.width || 1600) / 2, y: (current.height || 1000) / 2 };
            if (await act({ action: "addTokens", tokens: [{ id: "new", characterId: null, creatureId: null, ...at, ...t }] })) setAdding(false);
          }}
        />
      )}
    </div>
  );
}
