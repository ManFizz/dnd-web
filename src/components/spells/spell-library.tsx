"use client";

import { ExternalLink, Loader2, Pencil, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { SpellData } from "@/lib/rules/schema";
import { CLASS_PRESETS } from "@/lib/rules/tables";
import { libraryToSpellData, SOURCE_LABELS, type LibrarySpell } from "@/lib/spells";
import { RichView } from "@/components/rich/view";
import { blankSpell, LEVEL_OPTIONS, SpellBadges, SpellForm, spellLevelTitle } from "@/components/sheet/spell-form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, Empty, Segmented, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useSpellSearch } from "./use-spell-search";

type Scope = "all" | "dndsu" | "next-dndsu" | "mine";

async function apiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Ошибка ${res.status}`;
}

function SpellEditor({ spell, onClose, onSaved }: { spell: LibrarySpell | null; onClose: () => void; onSaved: (s: LibrarySpell) => void }) {
  const [form, setForm] = useState<SpellData>(() => (spell ? libraryToSpellData(spell) : blankSpell()));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const body = JSON.stringify({ spell: { ...form, nameRu: form.nameRu.trim() || "Новое заклинание", subclasses: spell?.subclasses ?? [] } });
      const res = await fetch(spell ? `/api/spells/${spell.id}` : "/api/spells", {
        method: spell ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error(await apiError(res));
      const { spell: saved } = (await res.json()) as { spell: LibrarySpell };
      onSaved(saved);
      toast.success(spell ? "Заклинание сохранено" : "Заклинание создано");
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
      title={spell ? `Изменить «${spell.nameRu}»` : "Новое заклинание"}
      description={
        spell?.ownerId === null
          ? "Это общее заклинание: правка увидят все. Повторный импорт с dnd.su перезапишет её."
          : "Заклинание появится в вашей личной библиотеке, его можно будет добавить любому своему персонажу."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {spell ? "Сохранить" : "Создать"}
          </Button>
        </>
      }
    >
      <SpellForm value={form} onChange={setForm} base={null} />
    </Modal>
  );
}

export function SpellLibrary({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const ask = useAsk();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [cls, setCls] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [nonce, setNonce] = useState(0);
  const search = useSpellSearch(
    { q, level, cls, source: scope === "dndsu" || scope === "next-dndsu" ? scope : undefined, mine: scope === "mine" },
    50,
    nonce,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LibrarySpell>>({});
  const [editing, setEditing] = useState<LibrarySpell | "new" | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/spells?stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats: Record<string, number> } | null) => !cancelled && d && setStats(d.stats))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const canEdit = (s: LibrarySpell) => s.ownerId === userId || (s.ownerId === null && isAdmin);

  const fetchFull = async (s: LibrarySpell): Promise<LibrarySpell | null> => {
    if (details[s.id]) return details[s.id];
    const res = await fetch(`/api/spells/${s.id}`);
    if (!res.ok) return null;
    const { spell } = (await res.json()) as { spell: LibrarySpell };
    setDetails((d) => ({ ...d, [s.id]: spell }));
    return spell;
  };

  const toggle = (s: LibrarySpell) => {
    if (openId === s.id) return setOpenId(null);
    setOpenId(s.id);
    void fetchFull(s);
  };

  const edit = async (s: LibrarySpell) => {
    const full = await fetchFull(s);
    if (full) setEditing(full);
    else toast.error("Не удалось загрузить заклинание");
  };

  const remove = async (s: LibrarySpell) => {
    const ok = await ask.confirm({
      title: `Удалить «${s.nameRu}»?`,
      description: "У персонажей, которые его используют, останется только название. Своё заклинание можно сначала скопировать в лист персонажа.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/spells/${s.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(await apiError(res));
    toast.success("Удалено");
    setNonce((n) => n + 1);
  };

  const shared = stats ? Object.entries(stats).reduce((a, [, n]) => a + n, 0) : null;
  const filtered = !!(q || level || cls || scope !== "all");
  const classOptions = CLASS_PRESETS.map((c) => ({ value: c.name.toLowerCase(), label: c.name }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Заклинания</h1>
          {stats && (
            <p className="text-sm text-muted">
              В общей библиотеке {shared}
              {Object.keys(stats).length > 0 && `: ${Object.entries(stats).map(([src, n]) => `${SOURCE_LABELS[src] ?? src} ${n}`).join(", ")}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button asChild variant="outline">
              <Link href="/spells/import">
                <Upload /> Загрузить с dnd.su
              </Link>
            </Button>
          )}
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus /> Своё заклинание
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название по-русски или по-английски" className="pl-9" />
          </div>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} options={[{ value: "", label: "Любой уровень" }, ...LEVEL_OPTIONS]} />
          <Select value={cls} onChange={(e) => setCls(e.target.value)} options={[{ value: "", label: "Любой класс" }, ...classOptions]} />
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          size="sm"
          className="self-start"
          options={[
            { value: "all", label: "Все" },
            { value: "dndsu", label: "dnd.su" },
            { value: "next-dndsu", label: "dnd.su 2024" },
            { value: "mine", label: "Мои" },
          ]}
        />
      </div>

      {search.error && <p className="text-sm text-danger">{search.error}</p>}

      {search.loaded && search.total === 0 && !filtered ? (
        <Empty icon={<Sparkles />} title="Библиотека пока пуста">
          {isAdmin ? (
            <>
              Загрузите заклинания с dnd.su на{" "}
              <Link href="/spells/import" className="text-info underline">
                странице импорта
              </Link>{" "}
              или создайте своё.
            </>
          ) : (
            "Общую библиотеку наполняет администратор сайта. А пока можно создать своё заклинание."
          )}
        </Empty>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel">
          {search.spells.map((s) => {
            const full = details[s.id];
            const open = openId === s.id;
            return (
              <div key={s.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(s)} aria-expanded={open}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{s.nameRu}</span>
                      {s.nameEn && <span className="text-xs text-faint">[{s.nameEn}]</span>}
                      <SpellBadges data={s} />
                      {s.source !== "dndsu" && <Badge tone={s.ownerId ? "accent" : "neutral"}>{SOURCE_LABELS[s.source] ?? s.source}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {spellLevelTitle(s.level)}
                      {s.school && `, ${s.school}`}
                      {s.classes.length > 0 && ` · ${s.classes.join(", ")}`}
                    </div>
                  </button>
                  {canEdit(s) && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button size="icon-sm" variant="ghost" onClick={() => void edit(s)} aria-label="Изменить" title="Изменить">
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => void remove(s)} aria-label="Удалить" title="Удалить">
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                {open && (
                  <div className="anim-fade mt-2 rounded-lg bg-panel-2 p-3 text-sm">
                    <div className="mb-2 grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
                      <div>Время: {s.castingTime || "—"}</div>
                      <div>Дистанция: {s.range || "—"}</div>
                      <div>Компоненты: {s.components || "—"}</div>
                      <div>Длительность: {s.duration || "—"}</div>
                      {s.subclasses.length > 0 && <div className="sm:col-span-2">Подклассы: {s.subclasses.join(", ")}</div>}
                    </div>
                    {full ? <RichView doc={full.description} /> : <Spinner className="text-faint" />}
                    {(s.url || s.sourceBook) && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-faint">
                        {s.sourceBook && <span>Источник: {s.sourceBook}</span>}
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-info hover:underline">
                            <ExternalLink className="size-3" /> {SOURCE_LABELS[s.source] ?? "Сайт"}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {search.loaded && search.spells.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">Ничего не нашлось</div>}
          {!search.loaded && (
            <div className="flex justify-center py-8">
              <Spinner className="text-faint" />
            </div>
          )}
        </div>
      )}

      {search.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={search.loadMore} disabled={search.loading}>
            {search.loading && <Loader2 className="animate-spin" />}
            Показать ещё ({search.total - search.spells.length})
          </Button>
        </div>
      )}

      {editing && (
        <SpellEditor
          spell={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setDetails((d) => ({ ...d, [saved.id]: saved }));
            setNonce((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
