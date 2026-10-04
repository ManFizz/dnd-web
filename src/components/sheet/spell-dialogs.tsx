"use client";

import { Check, ClipboardPaste, ExternalLink, Loader2, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/rules/ids";
import type { CharacterSpell, SpellData } from "@/lib/rules/schema";
import { docToText } from "@/lib/rules/richtext";
import {
  formatSpellList,
  libraryToSpellData,
  parseSpellList,
  resolveCharacterSpell,
  SOURCE_LABELS,
  spellDisplayName,
  splitSpellTitle,
  type LibrarySpell,
} from "@/lib/spells";
import { RichView } from "@/components/rich/view";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, Empty, Segmented, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useSpellSearch } from "@/components/spells/use-spell-search";
import { blankSpell, diffSpell, LEVEL_OPTIONS, SpellBadges, SpellForm, spellLevelTitle } from "./spell-form";
import { makeEvent, useChange, useComputed, useDoc, useSheet } from "./store";

export function newCharacterSpell(partial: Partial<CharacterSpell>): CharacterSpell {
  return {
    id: newId("sp"),
    spellId: null,
    lssId: null,
    name: "",
    level: 0,
    prepared: false,
    alwaysPrepared: false,
    inBook: false,
    source: "",
    override: null,
    custom: null,
    notes: "",
    ...partial,
  };
}

// --------------------------------------------------------------- library search

export function SpellLibraryDialog({ onClose }: { onClose: () => void }) {
  const doc = useDoc();
  const change = useChange();
  const addLibrary = useSheet((s) => s.addLibrary);
  const defaultClass = doc.classes[0]?.name.toLowerCase() ?? "";
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [cls, setCls] = useState(defaultClass);
  const search = useSpellSearch({ q, level, cls }, 40);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LibrarySpell>>({});
  const owned = useMemo(() => new Set(doc.spellcasting.spells.map((s) => s.spellId).filter(Boolean)), [doc.spellcasting.spells]);

  const toggleDetails = async (s: LibrarySpell) => {
    if (openId === s.id) return setOpenId(null);
    setOpenId(s.id);
    if (details[s.id]) return;
    const res = await fetch(`/api/spells/${s.id}`);
    if (res.ok) {
      const { spell } = (await res.json()) as { spell: LibrarySpell };
      setDetails((d) => ({ ...d, [s.id]: spell }));
    }
  };

  const add = (s: LibrarySpell) => {
    const full = details[s.id] ?? s;
    addLibrary([full]);
    change(
      (d) => {
        d.spellcasting.spells.push(newCharacterSpell({ spellId: s.id, name: s.nameRu, level: s.level }));
      },
      makeEvent("spell", `Добавлено заклинание «${s.nameRu}»`),
    );
  };

  const emptyLibrary = search.loaded && search.total === 0 && !q && !level && !cls;
  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Добавить заклинание"
      description="Поиск по библиотеке: dnd.su и ваши собственные заклинания."
      footer={
        <Button variant="primary" onClick={onClose}>
          Готово
        </Button>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_9rem_10rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название по-русски или по-английски" className="pl-9" />
        </div>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} options={[{ value: "", label: "Любой уровень" }, ...LEVEL_OPTIONS]} />
        <Input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="Класс" />
      </div>
      {search.error && <p className="mb-2 text-sm text-danger">{search.error}</p>}
      {emptyLibrary ? (
        <Empty title="Библиотека заклинаний пока пуста">
          Администратор сайта может загрузить заклинания с dnd.su на странице{" "}
          <Link href="/spells/import" className="text-info underline">
            импорта
          </Link>
          . А пока можно создать своё заклинание.
        </Empty>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {search.spells.map((s) => {
            const has = owned.has(s.id);
            const full = details[s.id];
            return (
              <div key={s.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggleDetails(s)}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{s.nameRu}</span>
                      {s.nameEn && <span className="text-xs text-faint">[{s.nameEn}]</span>}
                      <SpellBadges data={s} />
                      {s.source !== "dndsu" && <Badge>{SOURCE_LABELS[s.source] ?? s.source}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {spellLevelTitle(s.level)}
                      {s.school && `, ${s.school}`}
                      {s.classes.length > 0 && ` · ${s.classes.join(", ")}`}
                    </div>
                  </button>
                  <Button size="sm" variant={has ? "ghost" : "subtle"} onClick={() => add(s)} title={has ? "Уже есть, добавить ещё раз" : undefined}>
                    {has ? <Check /> : <Plus />}
                    {has ? "Есть" : "Добавить"}
                  </Button>
                </div>
                {openId === s.id && (
                  <div className="mt-2 rounded-lg bg-panel-2 p-3 text-sm">
                    <div className="mb-2 grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
                      <div>Время: {s.castingTime || "—"}</div>
                      <div>Дистанция: {s.range || "—"}</div>
                      <div>Компоненты: {s.components || "—"}</div>
                      <div>Длительность: {s.duration || "—"}</div>
                    </div>
                    {full ? <RichView doc={full.description} /> : <Spinner className="text-faint" />}
                  </div>
                )}
              </div>
            );
          })}
          {search.loaded && search.spells.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">Ничего не нашлось</div>}
          {!search.loaded && search.loading && (
            <div className="flex justify-center py-6">
              <Spinner className="text-faint" />
            </div>
          )}
        </div>
      )}
      {search.hasMore && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="outline" onClick={search.loadMore} disabled={search.loading}>
            {search.loading ? <Loader2 className="animate-spin" /> : null}
            Показать ещё ({search.total - search.spells.length})
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------- character spell entry

export function SpellEntryDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const library = useSheet((s) => s.library);
  const entry = doc.spellcasting.spells.find((s) => s.id === entryId);
  const lib = entry?.spellId ? library[entry.spellId] : undefined;
  const base = lib ? libraryToSpellData(lib) : null;
  const resolved = entry ? resolveCharacterSpell(entry, new Map(Object.entries(library))) : null;
  const [form, setForm] = useState<SpellData>(() => resolved?.data ?? { ...blankSpell(), nameRu: entry?.name ?? "", level: entry?.level ?? 0 });
  const [meta, setMeta] = useState(() => ({
    prepared: entry?.prepared ?? false,
    alwaysPrepared: entry?.alwaysPrepared ?? false,
    inBook: entry?.inBook ?? false,
    source: entry?.source ?? "",
    notes: entry?.notes ?? "",
  }));
  const [tab, setTab] = useState<"main" | "spell">("main");
  if (!entry) return null;
  const isCustom = !entry.spellId;
  const missing = !!entry.spellId && !lib;

  const save = () => {
    change(
      (d) => {
        const e = d.spellcasting.spells.find((s) => s.id === entryId);
        if (!e) return;
        Object.assign(e, meta);
        if (isCustom) {
          e.custom = form;
          e.name = form.nameRu || e.name;
          e.level = form.level;
        } else if (base) {
          e.override = diffSpell(base, form);
          e.name = form.nameRu || e.name;
          e.level = form.level;
        }
      },
      makeEvent("spell", `Изменено заклинание «${form.nameRu || entry.name}»`),
    );
    onClose();
  };

  const remove = async () => {
    const ok = await ask.confirm({ title: `Убрать «${entry.name}» из списка?`, confirmLabel: "Убрать", danger: true });
    if (!ok) return;
    change(
      (d) => {
        d.spellcasting.spells = d.spellcasting.spells.filter((s) => s.id !== entryId);
        if (d.combat.concentration?.spellEntryId === entryId) d.combat.concentration = null;
      },
      makeEvent("spell", `Убрано заклинание «${entry.name}»`),
    );
    onClose();
  };

  const overriddenCount = base ? Object.keys(diffSpell(base, form) ?? {}).length : 0;
  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={form.nameRu || entry.name || "Заклинание"}
      description={isCustom ? "Своё заклинание этого персонажа." : "Правки ниже меняют заклинание только для этого персонажа; библиотека остаётся прежней."}
      footer={
        <>
          <Button variant="danger" onClick={remove} className="mr-auto">
            <Trash2 /> Убрать
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={missing && tab === "spell"}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "main", label: "У персонажа" },
            { value: "spell", label: isCustom ? "Заклинание" : `Изменить для персонажа${overriddenCount ? ` · ${overriddenCount}` : ""}` },
          ]}
        />
      </div>
      {tab === "main" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox checked={meta.prepared} onChange={(e) => setMeta({ ...meta, prepared: e.target.checked })} label="Подготовлено" />
            <Checkbox checked={meta.alwaysPrepared} onChange={(e) => setMeta({ ...meta, alwaysPrepared: e.target.checked })} label="Всегда подготовлено" />
            <Checkbox checked={meta.inBook} onChange={(e) => setMeta({ ...meta, inBook: e.target.checked })} label="В книге заклинаний" />
          </div>
          <Field label="Откуда" hint="Класс, раса, предмет, черта">
            <Input value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} placeholder="Волшебник, Некрономикон…" />
          </Field>
          <Field label="Заметки">
            <Textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} rows={3} />
          </Field>
          {missing && (
            <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">Заклинание не найдено в библиотеке (возможно, его удалили). Можно убрать его из списка.</p>
          )}
          {lib?.url && (
            <a href={lib.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-info hover:underline">
              <ExternalLink className="size-3.5" /> Открыть на {SOURCE_LABELS[lib.source] ?? "сайте"}
            </a>
          )}
        </div>
      )}
      {tab === "spell" && !missing && <SpellForm value={form} onChange={setForm} base={base} />}
    </Modal>
  );
}

// -------------------------------------------------------------- custom spells

export function CustomSpellDialog({ onClose }: { onClose: () => void }) {
  const change = useChange();
  const addLibrary = useSheet((s) => s.addLibrary);
  const [form, setForm] = useState<SpellData>(blankSpell);
  const [where, setWhere] = useState<"character" | "library">("character");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const name = form.nameRu.trim() || "Новое заклинание";
    const data = { ...form, nameRu: name };
    if (where === "character") {
      change(
        (d) => {
          d.spellcasting.spells.push(newCharacterSpell({ custom: data, name, level: data.level }));
        },
        makeEvent("spell", `Создано своё заклинание «${name}»`),
      );
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/spells", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spell: data }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Ошибка ${res.status}`);
      const { spell } = (await res.json()) as { spell: LibrarySpell };
      addLibrary([spell]);
      change(
        (d) => {
          d.spellcasting.spells.push(newCharacterSpell({ spellId: spell.id, name, level: data.level }));
        },
        makeEvent("spell", `Создано заклинание «${name}» в личной библиотеке`),
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Своё заклинание"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Создать
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-col gap-1.5">
        <Segmented
          value={where}
          onChange={setWhere}
          options={[
            { value: "character", label: "Только у этого персонажа" },
            { value: "library", label: "В мою библиотеку" },
          ]}
        />
        <span className="text-xs text-muted">
          {where === "character" ? "Заклинание хранится в листе и не видно другим персонажам." : "Заклинание можно будет добавить любому вашему персонажу."}
        </span>
      </div>
      <SpellForm value={form} onChange={setForm} />
    </Modal>
  );
}

// ----------------------------------------------- matching imported spell names

type Match = { name: string; level: number | null; spell: LibrarySpell | null };

export function SpellMatchDialog({ onClose }: { onClose: () => void }) {
  const doc = useDoc();
  const change = useChange();
  const addLibrary = useSheet((s) => s.addLibrary);
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [keepMissing, setKeepMissing] = useState(true);
  const [markPrepared, setMarkPrepared] = useState(false);
  const unresolved = doc.meta.unresolvedSpells.length;
  const fromNotes = useMemo(() => parseSpellList(docToText(doc.spellcasting.notes)), [doc.spellcasting.notes]);

  const run = async () => {
    const entries = parseSpellList(text);
    if (!entries.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/spells/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names: entries.map((e) => e.name), edition: doc.settings.edition }),
      });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const { matches: found } = (await res.json()) as { matches: { spell: LibrarySpell | null }[] };
      setMatches(entries.map((e, i) => ({ ...e, spell: found[i]?.spell ?? null })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сопоставить");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!matches) return;
    const found = matches.filter((m) => m.spell);
    const missing = matches.filter((m) => !m.spell);
    addLibrary(found.map((m) => m.spell!));
    const existing = new Set(doc.spellcasting.spells.map((s) => s.spellId));
    // LSS keeps the spellbook as a flag per spell; when every imported spell had it, keep it for the matched ones.
    const inBook = doc.meta.unresolvedSpells.length > 0 && doc.meta.unresolvedSpells.every((u) => u.inBook);
    const flags = (level: number) => ({ inBook: inBook && level > 0, prepared: markPrepared && level > 0 });
    change(
      (d) => {
        for (const m of found) {
          if (existing.has(m.spell!.id)) continue;
          d.spellcasting.spells.push(newCharacterSpell({ spellId: m.spell!.id, name: m.spell!.nameRu, level: m.spell!.level, ...flags(m.spell!.level) }));
        }
        if (keepMissing) {
          for (const m of missing) {
            const { ru, en } = splitSpellTitle(m.name);
            const level = m.level ?? 0;
            d.spellcasting.spells.push(newCharacterSpell({ name: ru, level, ...flags(level), custom: { ...blankSpell(), nameRu: ru, nameEn: en, level } }));
          }
        }
        d.meta.unresolvedSpells = [];
      },
      makeEvent("spell", `Сопоставлены заклинания: найдено ${found.length}${missing.length ? `, не найдено ${missing.length}` : ""}`),
    );
    onClose();
  };

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Заклинания из импорта"
      description={`В файле Long Story Short заклинания записаны внутренними номерами (${unresolved} шт.), по ним нельзя узнать названия. Вставьте список названий, например из PDF-версии листа, и мы найдём их в библиотеке.`}
      footer={
        matches ? (
          <>
            <Button variant="ghost" onClick={() => setMatches(null)} className="mr-auto">
              Назад
            </Button>
            <Button variant="primary" onClick={apply}>
              Добавить найденные
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                change(
                  (d) => {
                    d.meta.unresolvedSpells = [];
                  },
                  makeEvent("spell", "Список нераспознанных заклинаний из импорта очищен"),
                );
                onClose();
              }}
            >
              Забыть о них
            </Button>
            <Button variant="primary" onClick={run} disabled={loading || !text.trim()}>
              {loading && <Loader2 className="animate-spin" />}
              Найти
            </Button>
          </>
        )
      }
    >
      {!matches ? (
        <div className="flex flex-col gap-2">
          {fromNotes.length > 0 && !text.trim() && (
            <Button size="sm" variant="subtle" className="self-start" onClick={() => setText(formatSpellList(fromNotes))}>
              <ClipboardPaste /> Взять {fromNotes.length} назв. из заметок о заклинаниях
            </Button>
          )}
          <Field
            label="Названия, по одному в строке"
            hint="Подойдёт «Огненный шар», «Fireball» или «Огненный шар [Fireball]». Строки «Заговоры» и «3 уровень» задают уровень тем, что не найдутся."
          >
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder={"Заговоры\nЛуч холода\n1 уровень\nВолшебная стрела\nЩит\n3 уровень\nОгненный шар [Fireball]"}
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted">
            Найдено {matches.filter((m) => m.spell).length} из {matches.length}.
          </div>
          <div className="flex max-h-96 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {matches.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                <span className="truncate">{m.name}</span>
                {m.spell ? (
                  <span className="flex shrink-0 items-center gap-1 text-good">
                    <Check className="size-4" /> {spellDisplayName(m.spell)}
                  </span>
                ) : (
                  <span className="shrink-0 text-danger">
                    не найдено{m.level !== null && <span className="text-faint"> · {m.level === 0 ? "заговор" : `${m.level} ур.`}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
          {matches.some((m) => !m.spell) && (
            <Checkbox checked={keepMissing} onChange={(e) => setKeepMissing(e.target.checked)} label="Ненайденные добавить как свои заклинания (с одним названием, описание можно дописать)" />
          )}
          <Checkbox checked={markPrepared} onChange={(e) => setMarkPrepared(e.target.checked)} label="Отметить как подготовленные (если список взят с листа подготовленных)" />
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------- casting

export function CastDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const library = useSheet((s) => s.library);
  const entry = doc.spellcasting.spells.find((s) => s.id === entryId);
  const resolved = entry ? resolveCharacterSpell(entry, new Map(Object.entries(library))) : null;
  const data = resolved?.data;
  const level = data?.level ?? entry?.level ?? 1;
  type Option = { key: string; label: string; kind: "slot" | "pact" | "ritual" | "free"; level: number; available: number };
  const options: Option[] = [];
  for (let l = Math.max(1, level); l <= 9; l++) {
    const total = sheet.spell.slots[l];
    if (!total) continue;
    const available = Math.max(0, total - (doc.spellcasting.slotsUsed[l] ?? 0));
    options.push({ key: `slot-${l}`, label: `Ячейка ${l} уровня`, kind: "slot", level: l, available });
  }
  const pact = sheet.spell.pact;
  if (pact.count > 0 && pact.level >= level) {
    options.push({ key: "pact", label: `Ячейка договора (${pact.level} ур.)`, kind: "pact", level: pact.level, available: Math.max(0, pact.count - doc.spellcasting.pactUsed) });
  }
  if (data?.ritual) options.push({ key: "ritual", label: "Ритуалом (+10 минут, без ячейки)", kind: "ritual", level, available: 1 });
  options.push({ key: "free", label: "Без ячейки (предмет, особенность, свиток)", kind: "free", level, available: 1 });
  const firstAvailable = options.find((o) => o.available > 0)?.key ?? "free";
  const [choice, setChoice] = useState(firstAvailable);
  if (!entry || !data) return null;
  const name = data.nameRu || entry.name;
  const current = doc.combat.concentration;
  const selected = options.find((o) => o.key === choice) ?? options[options.length - 1];

  const cast = () => {
    const events = [
      makeEvent(
        "spell",
        `Сотворено «${name}»${selected.kind === "slot" ? ` (ячейка ${selected.level} ур.)` : selected.kind === "pact" ? " (ячейка договора)" : selected.kind === "ritual" ? " (ритуал)" : ""}`,
      ),
    ];
    if (data.concentration) events.push(makeEvent("concentration", `Концентрация: «${name}»${current ? `, прервана «${current.name}»` : ""}`));
    change((d) => {
      if (selected.kind === "slot") d.spellcasting.slotsUsed[selected.level] = (d.spellcasting.slotsUsed[selected.level] ?? 0) + 1;
      if (selected.kind === "pact") d.spellcasting.pactUsed += 1;
      if (data.concentration) d.combat.concentration = { name, spellEntryId: entry.id, startedAt: new Date().toISOString(), note: "" };
    }, events);
    toast.success(`Сотворено: ${name}`);
    onClose();
  };

  return (
    <Modal
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={`Сотворить «${name}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={cast} disabled={selected.available <= 0}>
            Сотворить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <label
            key={o.key}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
              choice === o.key ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
              o.available <= 0 && "opacity-50",
            )}
          >
            <span className="flex items-center gap-2">
              <input type="radio" name="slot" checked={choice === o.key} onChange={() => setChoice(o.key)} className="accent-[var(--accent)]" disabled={o.available <= 0} />
              {o.label}
            </span>
            {(o.kind === "slot" || o.kind === "pact") && <span className="text-xs text-muted tabular-nums">осталось {o.available}</span>}
          </label>
        ))}
      </div>
      {data.concentration && current && (
        <p className="mt-3 rounded-lg bg-magic-soft p-2 text-sm text-magic">Концентрация на «{current.name}» прервётся.</p>
      )}
      {data.concentration && !current && <p className="mt-3 text-sm text-muted">Заклинание требует концентрации: она появится в шапке листа.</p>}
    </Modal>
  );
}

