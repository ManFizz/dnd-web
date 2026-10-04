"use client";

import { BookOpen, Download, FolderOpen, Gift, MoreHorizontal, Package, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LibraryFileSchema, type Stage, type TemplateKind, type TemplateRow } from "@/lib/grants";
import { featureKindLabel } from "@/lib/rules/compute";
import { computeSheet } from "@/lib/rules/compute";
import { newCounter, newFeature, newItem } from "@/lib/rules/defaults";
import { ITEM_CATEGORY_LABELS } from "@/lib/rules/labels";
import { parseCharacterDoc, type Counter, type Feature, type Item } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, Empty, Segmented, Spinner } from "@/components/ui/misc";
import { Menu, Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { EffectsEditor } from "@/components/sheet/effects";
import { CounterDialog, FeatureDialog, ItemDialog } from "@/components/sheet/editors";
import { ComputedContext, createSheetStore, SheetStoreContext } from "@/components/sheet/store";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";

// The GM's library: templates of items, features (boons, curses, mutations)
// and counters that can be granted to players, exported and imported.

type Body = Item | Feature | Counter;
type Editing = { id: string | null; kind: TemplateKind; body: Body; folder: string; tags: string[]; stages: Stage[] };

/** The sheet editors expect a sheet around them; the library gives them an empty one. */
export function SandboxSheet({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createSheetStore({ id: "library", doc: parseCharacterDoc({ name: "Шаблон" }), version: 0 }));
  const computed = useMemo(() => computeSheet(store.getState().doc), [store]);
  return (
    <SheetStoreContext value={store}>
      <ComputedContext value={computed}>{children}</ComputedContext>
    </SheetStoreContext>
  );
}

export function subkindLabel(t: { kind: TemplateKind; body: Body }): string {
  if (t.kind === "item") return ITEM_CATEGORY_LABELS[(t.body as Item).category];
  if (t.kind === "feature") return featureKindLabel((t.body as Feature).kind);
  return "Счётчик";
}

async function saveTemplate(campaignId: string, e: Editing) {
  const body = { kind: e.kind, body: e.body, folder: e.folder, tags: e.tags, stages: e.stages };
  if (e.id) await api(`/api/campaigns/${campaignId}/library/${e.id}`, { method: "PUT", body });
  else await api(`/api/campaigns/${campaignId}/library`, { method: "POST", body });
}

function ObjectEditor({ editing, onDone, onClose }: { editing: Editing; onDone: (body: Body) => void; onClose: () => void }) {
  const isNew = !editing.id;
  if (editing.kind === "item") return <ItemDialog initial={editing.body as Item} isNew={isNew} onClose={onClose} onSubmit={onDone} />;
  if (editing.kind === "feature") return <FeatureDialog initial={editing.body as Feature} isNew={isNew} onClose={onClose} onSubmit={onDone} />;
  return <CounterDialog initial={editing.body as Counter} isNew={isNew} onClose={onClose} onSubmit={onDone} />;
}

/** Folder, tags and the stages of a curse or a disease. */
function MetaDialog({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const { id: campaignId } = useCampaign();
  const [folder, setFolder] = useState(editing.folder);
  const [tags, setTags] = useState(editing.tags.join(", "));
  const [stages, setStages] = useState<Stage[]>(editing.stages);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() =>
      saveTemplate(campaignId, {
        ...editing,
        folder: folder.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        stages,
      }),
    );
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Папка и стадии: ${editing.body.name}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Папка" hint="Например: «Проклятия» или «Лут: Подземье»">
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Теги" hint="Через запятую">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </div>
        {editing.kind === "feature" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold">Стадии</h3>
              <Button size="sm" variant="outline" onClick={() => setStages([...stages, { name: `Стадия ${stages.length + 1}`, effects: [] }])}>
                <Plus /> Стадия
              </Button>
            </div>
            <p className="text-sm text-muted">
              Для проклятий и болезней, которые развиваются. У каждой стадии свои эффекты; ГМ переключает стадию у выдачи, эффекты на листе меняются сами.
            </p>
            {stages.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <Input value={s.name} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-8" />
                  <Button size="icon-sm" variant="ghost" aria-label="Убрать стадию" onClick={() => setStages(stages.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
                <EffectsEditor effects={s.effects} onChange={(effects) => setStages(stages.map((x, j) => (j === i ? { ...x, effects } : x)))} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

const NEW_OBJECTS: { label: string; make: () => Pick<Editing, "kind" | "body"> }[] = [
  { label: "Предмет", make: () => ({ kind: "item", body: newItem({ name: "" }) }) },
  { label: "Дар или благословение", make: () => ({ kind: "feature", body: newFeature({ kind: "boon", name: "" }) }) },
  { label: "Проклятие", make: () => ({ kind: "feature", body: newFeature({ kind: "curse", name: "" }) }) },
  { label: "Мутация", make: () => ({ kind: "feature", body: newFeature({ kind: "mutation", name: "", source: "Мутация" }) }) },
  { label: "Особенность", make: () => ({ kind: "feature", body: newFeature({ kind: "other", name: "" }) }) },
  { label: "Счётчик", make: () => ({ kind: "counter", body: newCounter({ name: "" }) }) },
];

export function LibraryTab({ onGrant }: { onGrant: (templateId: string) => void }) {
  const { id: campaignId } = useCampaign();
  const [data, reload] = useScopeData<{ templates: TemplateRow[] }>("library", `/api/campaigns/${campaignId}/library`);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | TemplateKind>("all");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [meta, setMeta] = useState<Editing | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ask = useAsk();

  const templates = data?.templates ?? null;
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (templates ?? []).filter(
      (t) =>
        (kind === "all" || t.kind === kind) &&
        (!query || t.name.toLowerCase().includes(query) || t.folder.toLowerCase().includes(query) || t.tags.some((x) => x.toLowerCase().includes(query))),
    );
  }, [templates, q, kind]);
  const folders = useMemo(() => {
    const map = new Map<string, TemplateRow[]>();
    for (const t of shown) map.set(t.folder, [...(map.get(t.folder) ?? []), t]);
    return [...map.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "ru")));
  }, [shown]);

  const edit = (t: TemplateRow): Editing => ({ id: t.id, kind: t.kind, body: t.body, folder: t.folder, tags: t.tags, stages: t.stages });

  const onSubmit = async (body: Body) => {
    if (!editing) return;
    const ok = await run(() => saveTemplate(campaignId, { ...editing, body }), editing.id ? "Шаблон сохранён" : "Добавлено в библиотеку");
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async (t: TemplateRow) => {
    const ok = await ask.confirm({
      title: `Удалить «${t.name}» из библиотеки?`,
      description: t.activeGrants ? "Выданные копии останутся у игроков, но обновлять их из библиотеки будет нельзя." : undefined,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok && (await run(() => api(`/api/campaigns/${campaignId}/library/${t.id}`, { method: "DELETE" }), "Удалено"))) reload();
  };

  const sync = async (t: TemplateRow) => {
    const ok = await ask.confirm({
      title: `Обновить «${t.name}» у игроков?`,
      description: `Копии (${t.activeGrants}) получат текущие свойства шаблона. Количество, заряды и то, что надето, останутся как есть.`,
      confirmLabel: "Обновить",
    });
    if (ok) await run(() => api(`/api/campaigns/${campaignId}/library/${t.id}`, { method: "POST", body: { action: "sync" } }), "Копии обновлены");
  };

  const importFile = async (file: File) => {
    try {
      const parsed = LibraryFileSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("Это не файл библиотеки");
      const r = await api<{ imported: number }>(`/api/campaigns/${campaignId}/library`, { method: "POST", body: parsed.data });
      toast.success(`Добавлено шаблонов: ${r.imported}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось импортировать");
    }
  };

  return (
    <SandboxSheet>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-faint" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию, папке, тегу" className="pl-8" />
          </div>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "Все" },
              { value: "item", label: "Предметы" },
              { value: "feature", label: "Особенности" },
              { value: "counter", label: "Счётчики" },
            ]}
          />
          <Menu
            trigger={
              <Button variant="primary">
                <Plus /> Создать
              </Button>
            }
            items={NEW_OBJECTS.map((o) => ({ label: o.label, onSelect: () => setEditing({ id: null, folder: "", tags: [], stages: [], ...o.make() }) }))}
          />
          <Menu
            trigger={
              <Button variant="outline" size="icon" aria-label="Ещё">
                <MoreHorizontal />
              </Button>
            }
            items={[
              { label: "Скачать библиотеку", icon: <Download />, onSelect: () => window.open(`/api/campaigns/${campaignId}/library/export`, "_blank") },
              { label: "Загрузить из файла", icon: <Upload />, onSelect: () => fileRef.current?.click() },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFile(f);
            }}
          />
        </div>

        {templates === null ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : templates.length === 0 ? (
          <Empty icon={<BookOpen />} title="Библиотека пуста">
            Создайте предмет, проклятие или мутацию один раз и выдавайте их игрокам в пару кликов. Эффекты применятся на листе сами.
          </Empty>
        ) : shown.length === 0 ? (
          <Empty title="Ничего не нашлось" />
        ) : (
          folders.map(([folder, rows]) => (
            <section key={folder} className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                <FolderOpen className="size-4" /> {folder || "Без папки"}
              </h3>
              <div className="overflow-hidden rounded-xl border border-line bg-panel">
                {rows.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
                    <button type="button" className="min-w-40 flex-1 text-left" onClick={() => setEditing(edit(t))}>
                      <div className="font-medium hover:text-accent">{t.name}</div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                        <span>{subkindLabel(t)}</span>
                        {t.stages.length > 0 && <Badge tone="danger">стадий: {t.stages.length}</Badge>}
                        {t.activeGrants > 0 && <Badge tone="accent">выдано: {t.activeGrants}</Badge>}
                        {t.tags.map((x) => (
                          <Badge key={x} tone="info">
                            {x}
                          </Badge>
                        ))}
                      </div>
                    </button>
                    <Button size="sm" variant="subtle" onClick={() => onGrant(t.id)}>
                      <Gift /> Выдать
                    </Button>
                    <Menu
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label="Действия">
                          <MoreHorizontal />
                        </Button>
                      }
                      items={[
                        { label: "Изменить", icon: <Pencil />, onSelect: () => setEditing(edit(t)) },
                        { label: "Папка, теги, стадии", icon: <FolderOpen />, onSelect: () => setMeta(edit(t)) },
                        ...(t.activeGrants ? [{ label: "Обновить у игроков", icon: <RefreshCw />, onSelect: () => void sync(t) }] : []),
                        ...(t.kind === "item"
                          ? [
                              {
                                label: "Положить в общий сундук",
                                icon: <Package />,
                                onSelect: () =>
                                  void run(
                                    () => api(`/api/campaigns/${campaignId}/stash`, { method: "POST", body: { action: "add", templateId: t.id } }),
                                    "Лежит в сундуке",
                                  ),
                              },
                            ]
                          : []),
                        "separator" as const,
                        { label: "Удалить", icon: <Trash2 />, danger: true, onSelect: () => void remove(t) },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
        {templates && templates.length > 0 && <p className="text-xs text-faint">Шаблонов в библиотеке: {templates.length}.</p>}
      </div>
      {editing && <ObjectEditor key={editing.id ?? "new"} editing={editing} onDone={(b) => void onSubmit(b)} onClose={() => setEditing(null)} />}
      {meta && (
        <MetaDialog
          editing={meta}
          onClose={() => setMeta(null)}
          onSaved={() => {
            setMeta(null);
            reload();
          }}
        />
      )}
    </SandboxSheet>
  );
}
