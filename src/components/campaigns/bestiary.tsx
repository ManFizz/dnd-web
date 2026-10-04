"use client";

import { ExternalLink, PawPrint, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCr, SIZE_LABELS, SIZES, type CreatureRow, type Size } from "@/lib/bestiary";
import { emptyDoc } from "@/lib/rules/richtext";
import type { RichDoc } from "@/lib/rules/richtext";
import { RichEditor } from "@/components/rich/editor";
import { RichView } from "@/components/rich/view";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/input";
import { Badge, Empty, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign } from "./context";

// Bestiary tab: search the shared dnd.su bestiary and the campaign's own
// creatures, read statblocks, add homebrew monsters.

type SearchResult = { creatures: CreatureRow[]; total: number; types: { type: string; count: number }[] };

const CR_OPTIONS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)].map((v) => ({ value: String(v), label: formatCr(v) }));

export function creatureLine(c: Pick<CreatureRow, "size" | "type" | "alignment">) {
  return [c.size ? SIZE_LABELS[c.size as Size] : "", c.type, c.alignment].filter(Boolean).join(", ");
}

/** Loads one creature with its statblock. */
export function useCreature(id: string | null): CreatureRow | null {
  const [data, setData] = useState<{ id: string; c: CreatureRow } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<{ creature: CreatureRow }>(`/api/bestiary/${id}`)
      .then((r) => alive && setData({ id, c: r.creature }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  return data && data.id === id ? data.c : null;
}

export function CreatureDialog({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit?: (c: CreatureRow) => void }) {
  const c = useCreature(id);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={c ? c.nameRu : "Существо"} description={c ? creatureLine(c) : undefined} size="lg">
      {!c ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge tone="danger">Опасность {formatCr(c.cr)}</Badge>
            <Badge>КД {c.ac}</Badge>
            <Badge tone="good">
              Хиты {c.hp}
              {c.hpFormula ? ` (${c.hpFormula})` : ""}
            </Badge>
            {c.speed && <Badge>{c.speed}</Badge>}
            {c.nameEn && <span className="text-muted">{c.nameEn}</span>}
            {c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-info hover:underline">
                dnd.su <ExternalLink className="size-3" />
              </a>
            )}
            {c.campaignId && onEdit && (
              <Button size="xs" variant="outline" onClick={() => onEdit(c)}>
                <Pencil /> Изменить
              </Button>
            )}
          </div>
          <RichView doc={c.statblock} label={c.nameRu} empty={<p className="text-sm text-faint">Статблока нет.</p>} />
        </div>
      )}
    </Modal>
  );
}

type Draft = {
  id: string | null;
  nameRu: string;
  nameEn: string;
  size: Size;
  type: string;
  alignment: string;
  cr: number;
  ac: number;
  hp: number;
  hpFormula: string;
  speed: string;
  statblock: RichDoc;
};

const blank = (): Draft => ({
  id: null,
  nameRu: "",
  nameEn: "",
  size: "medium",
  type: "чудовище",
  alignment: "",
  cr: 1,
  ac: 12,
  hp: 10,
  hpFormula: "",
  speed: "30 фт.",
  statblock: emptyDoc(),
});

function CustomCreatureDialog({ initial, types, onClose }: { initial: Draft; types: string[]; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    const { id, ...body } = d;
    const ok = await run(
      () => api(id ? `/api/campaigns/${campaignId}/creatures/${id}` : `/api/campaigns/${campaignId}/creatures`, { method: id ? "PUT" : "POST", body }),
      id ? "Сохранено" : "Существо добавлено",
    );
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={d.id ? `Изменить: ${initial.nameRu}` : "Своё существо"}
      description="Его видят только ГМы этой кампании. Оно участвует в мутациях и в бою."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !d.nameRu.trim() || !d.type.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Имя" className="sm:col-span-2" required>
          <Input value={d.nameRu} onChange={(e) => set("nameRu", e.target.value)} />
        </Field>
        <Field label="Имя по-английски" className="sm:col-span-2">
          <Input value={d.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </Field>
        <Field label="Размер">
          <Select value={d.size} onChange={(e) => set("size", e.target.value as Size)} options={SIZES.map((s) => ({ value: s, label: SIZE_LABELS[s] }))} />
        </Field>
        <Field label="Тип" required>
          <Input value={d.type} onChange={(e) => set("type", e.target.value.toLowerCase())} list="creature-types" />
          <datalist id="creature-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Мировоззрение" className="sm:col-span-2">
          <Input value={d.alignment} onChange={(e) => set("alignment", e.target.value)} />
        </Field>
        <Field label="Опасность">
          <Select value={String(d.cr)} onChange={(e) => set("cr", Number(e.target.value))} options={CR_OPTIONS} />
        </Field>
        <Field label="КД">
          <NumberInput value={d.ac} min={0} onCommit={(v) => set("ac", v)} />
        </Field>
        <Field label="Хиты">
          <NumberInput value={d.hp} min={0} onCommit={(v) => set("hp", v)} />
        </Field>
        <Field label="Кости хитов">
          <Input value={d.hpFormula} onChange={(e) => set("hpFormula", e.target.value)} placeholder="4d8+4" className="font-mono" />
        </Field>
        <Field label="Скорость" className="sm:col-span-4">
          <Input value={d.speed} onChange={(e) => set("speed", e.target.value)} />
        </Field>
        <Field label="Статблок" className="sm:col-span-4">
          <RichEditor
            value={d.statblock}
            onChange={(statblock) => set("statblock", statblock)}
            placeholder="Характеристики, умения, действия…"
            minHeight="10rem"
          />
        </Field>
      </div>
    </Modal>
  );
}

export function BestiaryTab() {
  const { id: campaignId, scopes } = useCampaign();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [size, setSize] = useState("");
  const [crMin, setCrMin] = useState("");
  const [crMax, setCrMax] = useState("");
  const [custom, setCustom] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SearchResult | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const ask = useAsk();
  const tick = scopes.bestiary ?? 0;

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ campaignId, limit: "50", offset: String(page * 50) });
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("type", type);
    if (size) params.set("size", size);
    if (crMin) params.set("crMin", crMin);
    if (crMax) params.set("crMax", crMax);
    if (custom) params.set("custom", "1");
    const t = setTimeout(() => {
      api<SearchResult>(`/api/bestiary?${params}`)
        .then((r) => alive && setData(r))
        .catch(() => {});
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [campaignId, q, type, size, crMin, crMax, custom, page, tick]);

  const types = data?.types.map((t) => t.type) ?? [];
  const remove = async (c: CreatureRow) => {
    if (!(await ask.confirm({ title: `Удалить «${c.nameRu}»?`, confirmLabel: "Удалить", danger: true }))) return;
    await run(() => api(`/api/campaigns/${campaignId}/creatures/${c.id}`, { method: "DELETE" }), "Удалено");
  };
  const edit = (c: CreatureRow) => {
    setViewing(null);
    setEditing({
      id: c.id,
      nameRu: c.nameRu,
      nameEn: c.nameEn,
      size: (c.size || "medium") as Size,
      type: c.type,
      alignment: c.alignment,
      cr: c.cr,
      ac: c.ac,
      hp: c.hp,
      hpFormula: c.hpFormula,
      speed: c.speed,
      statblock: c.statblock ?? emptyDoc(),
    });
  };
  const filter = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-faint" />
          <Input type="search" value={q} onChange={(e) => filter(() => setQ(e.target.value))} placeholder="Имя существа" className="pl-8" />
        </div>
        <Select
          value={type}
          onChange={(e) => filter(() => setType(e.target.value))}
          className="w-40"
          options={[{ value: "", label: "Любой тип" }, ...(data?.types ?? []).map((t) => ({ value: t.type, label: `${t.type} (${t.count})` }))]}
        />
        <Select
          value={size}
          onChange={(e) => filter(() => setSize(e.target.value))}
          className="w-36"
          options={[{ value: "", label: "Любой размер" }, ...SIZES.map((s) => ({ value: s, label: SIZE_LABELS[s] }))]}
        />
        <Select
          value={crMin}
          onChange={(e) => filter(() => setCrMin(e.target.value))}
          className="w-28"
          options={[{ value: "", label: "ОП от" }, ...CR_OPTIONS]}
        />
        <Select
          value={crMax}
          onChange={(e) => filter(() => setCrMax(e.target.value))}
          className="w-28"
          options={[{ value: "", label: "ОП до" }, ...CR_OPTIONS]}
        />
        <Button variant={custom ? "subtle" : "outline"} onClick={() => filter(() => setCustom(!custom))}>
          Только свои
        </Button>
        <Button variant="primary" onClick={() => setEditing(blank())}>
          <Plus /> Своё существо
        </Button>
      </div>

      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : data.total === 0 && !q && !type && !size && !crMin && !crMax && !custom ? (
        <Empty icon={<PawPrint />} title="Бестиарий пуст">
          Администратор сайта загружает существ с dnd.su на странице{" "}
          <Link href="/bestiary/import" className="text-info hover:underline">
            «Загрузка бестиария»
          </Link>
          . Своих существ можно добавить кнопкой выше.
        </Empty>
      ) : data.creatures.length === 0 ? (
        <Empty title="Ничего не нашлось" />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {data.creatures.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
                <button type="button" className="min-w-40 flex-1 text-left" onClick={() => setViewing(c.id)}>
                  <div className="flex items-center gap-1.5 font-medium hover:text-accent">
                    {c.nameRu}
                    {c.campaignId && <Badge tone="magic">своё</Badge>}
                  </div>
                  <div className="text-xs text-muted">{creatureLine(c)}</div>
                </button>
                <span className="w-16 text-sm text-muted tabular-nums">ОП {formatCr(c.cr)}</span>
                <span className="w-14 text-sm text-muted tabular-nums">КД {c.ac}</span>
                <span className="w-16 text-sm text-muted tabular-nums">♥ {c.hp}</span>
                {c.campaignId && (
                  <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={() => remove(c)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              Найдено: {data.total}
              {" · "}
              <Link href="/bestiary/import" className="inline-flex items-center gap-1 hover:text-text">
                <Upload className="size-3" /> загрузка с dnd.su
              </Link>
            </span>
            {data.total > 50 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Назад
                </Button>
                <span className="tabular-nums">
                  {page + 1} / {Math.ceil(data.total / 50)}
                </span>
                <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>
                  Дальше
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      {viewing && <CreatureDialog id={viewing} onClose={() => setViewing(null)} onEdit={edit} />}
      {editing && <CustomCreatureDialog initial={editing} types={types} onClose={() => setEditing(null)} />}
    </div>
  );
}
