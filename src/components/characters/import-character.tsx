"use client";

import { AlertTriangle, Check, ClipboardPaste, FileJson, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { CHARACTER_EXPORT_FORMAT } from "@/lib/download";
import { importLss } from "@/lib/import/lss";
import { computeSheet } from "@/lib/rules/compute";
import { formatMod } from "@/lib/rules/constants";
import { safeParseCharacterDoc, type CharacterDoc } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";

type Parsed = {
  kind: "lss" | "own";
  fileName: string;
  doc: CharacterDoc;
  warnings: string[];
  summary: string[];
};

function parseInput(text: string, fileName: string): Parsed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Это не JSON. Нужен файл, который скачивается кнопкой экспорта в Long Story Short или в этом листе.");
  }
  if (raw && typeof raw === "object" && (raw as { format?: unknown }).format === CHARACTER_EXPORT_FORMAT) {
    const parsed = safeParseCharacterDoc((raw as { doc?: unknown }).doc);
    if (!parsed.success) throw new Error("Файл повреждён: персонаж не прошёл проверку");
    return { kind: "own", fileName, doc: parsed.data, warnings: [], summary: [] };
  }
  const result = importLss(raw);
  return { kind: "lss", fileName, ...result };
}

export function ImportCharacter() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (text: string, fileName: string) => {
    try {
      const p = parseInput(text, fileName);
      setParsed(p);
      setName(p.doc.name);
      setError(null);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    }
  };

  const loadFile = async (file: File) => {
    if (file.size > 3_500_000) {
      setError("Файл слишком большой (больше 3,5 МБ). Обычно экспорт персонажа весит гораздо меньше.");
      return;
    }
    load(await file.text(), file.name);
  };

  const create = async () => {
    if (!parsed) return;
    setBusy(true);
    const doc = { ...parsed.doc, name: name.trim() || parsed.doc.name };
    const summary =
      parsed.kind === "lss"
        ? `Импорт из Long Story Short${parsed.warnings.length ? ` (предупреждений: ${parsed.warnings.length})` : ""}`
        : `Загружен из файла «${parsed.fileName}»`;
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc, events: [{ kind: "import", summary, data: { lines: parsed.summary, warnings: parsed.warnings } }] }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Ошибка ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      router.push(`/characters/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать персонажа");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Импорт персонажа</h1>
        <p className="mt-1 text-muted">
          Из Long Story Short: откройте персонажа, нажмите экспорт и загрузите полученный файл сюда. Подходит и JSON, скачанный из этого листа.
        </p>
      </div>

      {!parsed && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-muted",
            )}
          >
            <Upload className="size-8 text-faint" />
            <span className="font-medium">Перетащите файл сюда или нажмите, чтобы выбрать</span>
            <span className="text-sm text-muted">JSON или TXT из экспорта</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
          {showPaste ? (
            <div className="flex flex-col gap-2">
              <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} placeholder="Вставьте содержимое файла экспорта" className="font-mono text-xs" />
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => load(paste, "вставленный текст")} disabled={!paste.trim()}>
                  Прочитать
                </Button>
                <Button variant="ghost" onClick={() => setShowPaste(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="self-start" onClick={() => setShowPaste(true)}>
              <ClipboardPaste /> Вставить текстом
            </Button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}

      {parsed && <Preview parsed={parsed} name={name} onName={setName} />}

      {parsed && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button
            variant="ghost"
            onClick={() => {
              setParsed(null);
              setError(null);
            }}
          >
            Выбрать другой файл
          </Button>
          <Button variant="primary" size="lg" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Создать персонажа
          </Button>
        </div>
      )}
    </div>
  );
}

function Preview({ parsed, name, onName }: { parsed: Parsed; name: string; onName: (v: string) => void }) {
  const { doc } = parsed;
  const s = useMemo(() => computeSheet(doc), [doc]);
  const classes = doc.classes.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / ");
  const unresolved = doc.meta.unresolvedSpells.length;
  const tiles = [
    { label: "Уровень", value: s.level },
    { label: "КД", value: s.ac.value },
    { label: "Хиты", value: `${doc.combat.hpCurrent}/${s.hpMax.value}` },
    { label: "Мастерство", value: formatMod(s.prof.value) },
    ...(s.spell.hasCasting ? [{ label: "СЛ заклинаний", value: s.spell.dc.value }] : []),
  ];
  const counts = [
    { label: "особенностей", n: doc.features.length },
    { label: "предметов", n: doc.items.length },
    { label: "заклинаний", n: doc.spellcasting.spells.length + unresolved },
    { label: "бонусов", n: doc.bonuses.length },
    { label: "счётчиков", n: doc.counters.length },
    { label: "заметок", n: doc.notes.length },
  ].filter((c) => c.n > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted">
          <FileJson className="size-4" /> {parsed.fileName}
          <Badge tone={parsed.kind === "lss" ? "info" : "accent"}>{parsed.kind === "lss" ? "Long Story Short" : "Лист героя"}</Badge>
        </div>
        <Field label="Имя">
          <Input value={name} onChange={(e) => onName(e.target.value)} maxLength={200} className="font-display text-lg font-bold" />
        </Field>
        <div className="mt-1 text-sm text-muted">{[doc.info.race, classes, doc.info.background].filter(Boolean).join(" · ") || "Раса и класс не указаны"}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col items-center rounded-lg bg-panel-2 px-2 py-2">
              <span className="font-display text-xl font-bold tabular-nums">{t.value}</span>
              <span className="text-xs text-muted">{t.label}</span>
            </div>
          ))}
        </div>
        {counts.length > 0 && <p className="mt-3 text-sm text-muted">Перенесётся: {counts.map((c) => `${c.n} ${c.label}`).join(", ")}.</p>}
      </div>
      {unresolved > 0 && (
        <div className="rounded-xl border border-info/40 bg-info-soft p-4 text-sm">
          <div className="font-medium text-info">Заклинаний для сопоставления: {unresolved}</div>
          <p className="mt-1 text-muted">
            В экспорте LSS заклинания записаны внутренними номерами без названий. После создания откройте вкладку «Заклинания» и нажмите «Сопоставить»: туда
            можно вставить список названий, например из PDF-листа.
          </p>
        </div>
      )}
      {parsed.summary.length > 0 && (
        <details className="rounded-xl border border-line bg-panel p-4 text-sm">
          <summary className="cursor-pointer font-medium">Что перенесено</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
            {parsed.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {parsed.warnings.length > 0 && (
        <details open className="rounded-xl border border-danger/40 bg-panel p-4 text-sm">
          <summary className="cursor-pointer font-medium text-danger">Требует внимания: {parsed.warnings.length}</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
            {parsed.warnings.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
