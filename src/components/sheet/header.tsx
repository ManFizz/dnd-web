"use client";

import {
  ArrowLeft,
  ArrowUpCircle,
  Check,
  CloudOff,
  Dices,
  Download,
  History,
  ImagePlus,
  Loader2,
  Moon,
  MoreHorizontal,
  Redo2,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { characterExport, downloadJson } from "@/lib/download";
import { XP_BY_LEVEL } from "@/lib/rules/constants";
import { STAT_INFO } from "@/lib/rules/glossary";
import { Button } from "@/components/ui/button";
import { CommitInput, Input } from "@/components/ui/input";
import { Menu, Popover, Tip } from "@/components/ui/overlay";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useAsk } from "@/components/ui/prompt";
import { useTheme } from "@/components/theme";
import { useOpenDialog } from "./dialogs-context";
import { RollDetail } from "./dice";
import type { PanelId } from "./sheet-app";
import { makeEvent, useChange, useComputed, useDoc, useSheet, useSheetApi, type SheetStore } from "./store";

/** Replaces the local document with the latest saved version. */
async function reloadFromServer(api: SheetStore): Promise<boolean> {
  const s = api.getState();
  const res = await fetch(`/api/characters/${s.id}`, { cache: "no-store" });
  if (!res.ok) {
    toast.error("Не удалось загрузить");
    return false;
  }
  const data = (await res.json()) as { doc: typeof s.doc; version: number };
  api.getState().replace(data.doc, data.version);
  return true;
}

function SaveIndicator() {
  const status = useSheet((s) => s.status);
  const error = useSheet((s) => s.error);
  const api = useSheetApi();
  const ask = useAsk();
  if (status === "conflict") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-2.5 py-1 text-xs text-danger">
        <CloudOff className="size-4" />
        <span className="hidden sm:inline">Изменён в другом окне</span>
        <Button
          size="xs"
          variant="danger"
          onClick={async () => {
            const ok = await ask.confirm({
              title: "Загрузить версию с сервера?",
              description: "Ваши несохранённые изменения в этом окне пропадут.",
              confirmLabel: "Загрузить",
              danger: true,
            });
            if (ok) await reloadFromServer(api);
          }}
        >
          Загрузить
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            const ok = await ask.confirm({
              title: "Сохранить поверх?",
              description: "Изменения, сделанные в другом окне, будут заменены тем, что открыто здесь.",
              confirmLabel: "Сохранить поверх",
              danger: true,
            });
            if (!ok) return;
            const s = api.getState();
            const res = await fetch(`/api/characters/${s.id}`);
            if (!res.ok) return toast.error("Не удалось загрузить версию");
            const { version } = (await res.json()) as { version: number };
            api.setState({ version, status: "dirty", dirty: true, error: null });
            s.requestSave();
          }}
        >
          Перезаписать
        </Button>
      </div>
    );
  }
  const map = {
    saved: { icon: <Check className="size-4" />, text: "Сохранено", cls: "text-faint" },
    dirty: { icon: <Loader2 className="size-4 opacity-50" />, text: "Есть изменения", cls: "text-faint" },
    saving: { icon: <Loader2 className="size-4 animate-spin" />, text: "Сохраняю…", cls: "text-muted" },
    error: { icon: <CloudOff className="size-4" />, text: "Не сохранено", cls: "text-danger" },
  } as const;
  const m = map[status];
  return (
    <div className={cn("flex items-center gap-1.5 text-xs", m.cls)} title={status === "error" ? (error ?? "") : undefined}>
      {m.icon}
      <span className="hidden sm:inline">{m.text}</span>
      {status === "error" && (
        <button type="button" className="underline" onClick={() => api.getState().requestSave()}>
          повторить
        </button>
      )}
    </div>
  );
}

function RollHistory() {
  const rolls = useSheet((s) => s.rolls);
  const clear = useSheet((s) => s.clearRolls);
  return (
    <Popover
      align="end"
      className="w-96"
      tip="История бросков"
      trigger={
        <Button size="icon" variant="ghost" aria-label="История бросков">
          <Dices />
        </Button>
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="font-display font-bold">Броски</div>
        {rolls.length > 0 && (
          <Button size="xs" variant="ghost" onClick={clear}>
            Очистить
          </Button>
        )}
      </div>
      {rolls.length === 0 ? (
        <p className="text-sm text-muted">Нажмите на любой бонус, кубик в описании или кнопку атаки, чтобы бросить.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rolls.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 rounded-lg bg-panel-2 px-2.5 py-1.5">
              <span
                className={cn(
                  "w-9 text-center font-display text-lg font-bold tabular-nums",
                  r.natural === 20 ? "text-good" : r.natural === 1 ? "text-danger" : "text-accent",
                )}
              >
                {r.result.total}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm">{r.label}</div>
                <div className="truncate text-xs text-muted">
                  <RollDetail result={r.result} />
                </div>
              </div>
              <span className="ml-auto shrink-0 text-[11px] text-faint">{new Date(r.at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </Popover>
  );
}

async function resizeImage(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Не удалось прочитать картинку"));
      img.src = url;
    });
    // Square crop from the center, scaled down to `size`.
    const crop = Math.min(img.width, img.height);
    const side = Math.min(size, crop);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Браузер не умеет обрабатывать картинки");
    ctx.drawImage(img, (img.width - crop) / 2, (img.height - crop) / 2, crop, crop, 0, 0, side, side);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Avatar() {
  const doc = useDoc();
  const change = useChange();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const set = (avatarUrl: string, summary: string) =>
    change((d) => {
      d.avatarUrl = avatarUrl;
    }, makeEvent("edit", summary));
  return (
    <Popover
      trigger={
        <button
          type="button"
          className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-line bg-panel-2 hover:border-accent sm:size-16"
          aria-label="Портрет"
        >
          <AvatarImage src={doc.avatarUrl} className="size-full object-cover" fallback={<UserRound className="m-auto size-7 text-faint" />} />
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="font-display font-bold">Портрет</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              set(await resizeImage(file), "Новый портрет");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Не удалось загрузить картинку");
            }
          }}
        />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <ImagePlus /> Загрузить с устройства
        </Button>
        <div className="flex gap-1.5">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="или ссылка https://…" className="h-8 text-xs" />
          <Button size="sm" variant="outline" disabled={!/^https:\/\//.test(url)} onClick={() => set(url, "Новый портрет по ссылке")}>
            OK
          </Button>
        </div>
        {doc.avatarUrl && (
          <Button size="sm" variant="ghost" onClick={() => set("", "Портрет удалён")}>
            <Trash2 /> Убрать портрет
          </Button>
        )}
      </div>
    </Popover>
  );
}

function XpBar() {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const ask = useAsk();
  const open = useOpenDialog();
  const level = sheet.level;
  const xp = doc.info.xp;
  const next = XP_BY_LEVEL[Math.min(20, level + 1)] ?? null;
  const prev = XP_BY_LEVEL[Math.min(20, level)] ?? 0;
  const progress = next && next > prev ? Math.max(0, Math.min(1, (xp - prev) / (next - prev))) : 1;
  const canLevel = next !== null && level < 20 && xp >= next && doc.classes.length > 0;
  const tip = (
    <>
      <div className="font-semibold">Опыт</div>
      <div className="text-muted">{STAT_INFO.xp}</div>
      {next !== null && level < 20 && (
        <div className="mt-1">
          До {level + 1} уровня: {Math.max(0, next - xp).toLocaleString("ru")} XP
        </div>
      )}
      <div className="mt-1 text-faint">Нажмите, чтобы добавить опыт</div>
    </>
  );
  return (
    <div className="flex min-w-36 flex-1 items-center gap-1.5 sm:flex-none">
      <Tip content={tip} side="bottom">
        <button
          type="button"
          className="group flex min-w-0 flex-1 flex-col gap-1 text-left"
          aria-label="Добавить опыт"
          onClick={async () => {
            const r = await ask.amount({ title: "Опыт", direction: "gain", requireReason: doc.settings.requireReasons, unit: "XP" });
            if (!r) return;
            const after = Math.max(0, xp + r.delta);
            change(
              (d) => {
                d.info.xp = after;
              },
              makeEvent("xp", `Опыт: ${xp.toLocaleString("ru")} → ${after.toLocaleString("ru")} (${r.delta > 0 ? "+" : ""}${r.delta})`, r.reason),
            );
            const target = XP_BY_LEVEL[Math.min(20, level + 1)];
            if (level < 20 && after >= target && doc.classes.length)
              toast.success("Опыта хватает на новый уровень!", {
                action: { label: "Повысить", onClick: () => open({ kind: "level-up" }) },
              });
          }}
        >
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
            <span>
              XP {xp.toLocaleString("ru")}
              {next !== null && level < 20 && <span className="text-faint"> / {next.toLocaleString("ru")}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
            <div className={cn("h-full rounded-full transition-all", canLevel ? "bg-good" : "bg-accent group-hover:bg-accent-strong")} style={{ width: `${progress * 100}%` }} />
          </div>
        </button>
      </Tip>
      {canLevel && (
        <Tip content="Опыта хватает: выберите класс, который получит уровень">
          <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-good" onClick={() => open({ kind: "level-up" })}>
            <ArrowUpCircle /> Уровень
          </Button>
        </Tip>
      )}
    </div>
  );
}

export function SheetHeader({ onTab, onPanel }: { onTab: (tab: string) => void; onPanel: (panel: PanelId | null) => void }) {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const undo = useSheet((s) => s.undo);
  const redo = useSheet((s) => s.redo);
  const canUndo = useSheet((s) => s.past.length > 0);
  const canRedo = useSheet((s) => s.future.length > 0);
  const id = useSheet((s) => s.id);
  const ask = useAsk();
  const router = useRouter();
  const api = useSheetApi();
  const [theme, setTheme] = useTheme();
  const classes = doc.classes.map((c) => `${c.name || "Класс"}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / ");

  const exportJson = () => downloadJson(`${doc.name || "character"}.json`, characterExport(doc));

  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <Button asChild size="icon" variant="ghost" aria-label="К списку персонажей" title="К списку персонажей">
          <Link href="/characters">
            <ArrowLeft />
          </Link>
        </Button>
        <Avatar />
        <div className="min-w-0 flex-1">
          <CommitInput
            value={doc.name}
            aria-label="Имя персонажа"
            onCommit={(name) =>
              change(
                (d) => {
                  d.name = name.trim() || d.name;
                },
                makeEvent("edit", `Имя: ${doc.name} → ${name.trim()}`),
              )
            }
            className="h-auto w-full max-w-md truncate border-transparent bg-transparent px-1 py-0 font-display text-2xl font-bold hover:border-line focus:bg-panel-2"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-sm text-muted">
            <button type="button" className="hover:text-text" onClick={() => onTab("race")}>
              {doc.info.race || "Раса не указана"}
            </button>
            <span className="text-faint">·</span>
            <button type="button" className="hover:text-text" onClick={() => onTab("class")}>
              {classes || "Класс не указан"}
            </button>
            <span className="rounded-md bg-accent-soft px-1.5 text-xs font-semibold text-accent">ур. {sheet.level}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {!doc.settings.hidden.includes("info.xp") && <XpBar />}
        <div className="ml-auto flex items-center gap-1">
          <SaveIndicator />
          <Tip content="Отменить последнее изменение (Ctrl+Z)">
            <span className="inline-flex">
              <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} aria-label="Отменить">
                <Undo2 />
              </Button>
            </span>
          </Tip>
          <Tip content="Вернуть отменённое (Ctrl+Shift+Z)">
            <span className="inline-flex">
              <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} aria-label="Повторить">
                <Redo2 />
              </Button>
            </span>
          </Tip>
          <RollHistory />
          <Tip content="Журнал изменений: что, когда и за что менялось. С поиском">
            <Button size="icon" variant="ghost" aria-label="Журнал" onClick={() => onPanel("journal")} className="max-sm:hidden">
              <History />
            </Button>
          </Tip>
          <Tip content="Настройки листа: редакция правил, что показывать, файл персонажа">
            <Button size="icon" variant="ghost" aria-label="Настройки" onClick={() => onPanel("settings")} className="max-sm:hidden">
              <Settings />
            </Button>
          </Tip>
          <Menu
            trigger={
              <Button size="icon" variant="ghost" aria-label="Ещё">
                <MoreHorizontal />
              </Button>
            }
            items={[
              { label: "Журнал изменений", icon: <History />, onSelect: () => onPanel("journal") },
              { label: "Настройки листа", icon: <Settings />, onSelect: () => onPanel("settings") },
              { label: "Скачать JSON", icon: <Download />, onSelect: exportJson },
              {
                label: "Загрузить с сервера",
                icon: <RefreshCw />,
                onSelect: async () => {
                  if (api.getState().dirty) {
                    const ok = await ask.confirm({
                      title: "Загрузить сохранённую версию?",
                      description: "Изменения, которые ещё не успели сохраниться, пропадут.",
                      confirmLabel: "Загрузить",
                      danger: true,
                    });
                    if (!ok) return;
                  }
                  if (await reloadFromServer(api)) toast.success("Загружена последняя версия");
                },
              },
              {
                label: theme === "dark" ? "Светлая тема" : "Тёмная тема",
                icon: theme === "dark" ? <Sun /> : <Moon />,
                onSelect: () => setTheme(theme === "dark" ? "light" : "dark"),
              },
              "separator",
              {
                label: "Удалить персонажа",
                icon: <Trash2 />,
                danger: true,
                onSelect: async () => {
                  const ok = await ask.confirm({
                    title: `Удалить «${doc.name}»?`,
                    description: "Персонаж и его журнал будут удалены без возможности восстановления. Можно сначала скачать JSON.",
                    confirmLabel: "Удалить навсегда",
                    danger: true,
                  });
                  if (!ok) return;
                  const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
                  if (!res.ok) return toast.error("Не удалось удалить");
                  router.push("/characters");
                },
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
