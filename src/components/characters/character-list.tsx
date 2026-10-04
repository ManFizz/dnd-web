"use client";

import { Copy, Download, FileUp, MoreVertical, Plus, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { characterExport, downloadJson } from "@/lib/download";
import type { CharacterDoc } from "@/lib/rules/schema";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { Menu } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";

export type CharacterRow = { id: string; name: string; summary: string; avatarUrl: string; updatedAt: string };

const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "только что";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("ru");
}

async function fetchDoc(id: string): Promise<CharacterDoc> {
  const res = await fetch(`/api/characters/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось загрузить персонажа");
  return ((await res.json()) as { doc: CharacterDoc }).doc;
}

export function CharacterList({ initial }: { initial: CharacterRow[] }) {
  const [rows, setRows] = useState(initial);
  const router = useRouter();
  const ask = useAsk();

  const duplicate = async (row: CharacterRow) => {
    try {
      const doc = await fetchDoc(row.id);
      const copy = { ...doc, name: `${doc.name} (копия)`.slice(0, 200) };
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc: copy, events: [{ kind: "create", summary: `Создан копированием персонажа «${doc.name}»` }] }),
      });
      if (!res.ok) throw new Error("Не удалось создать копию");
      const { id } = (await res.json()) as { id: string };
      setRows((r) => [{ ...row, id, name: copy.name, updatedAt: new Date().toISOString() }, ...r]);
      toast.success("Копия создана");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const exportOne = async (row: CharacterRow) => {
    try {
      const doc = await fetchDoc(row.id);
      downloadJson(`${doc.name || "character"}.json`, characterExport(doc));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const remove = async (row: CharacterRow) => {
    const ok = await ask.confirm({
      title: `Удалить «${row.name}»?`,
      description: "Персонаж и его журнал будут удалены навсегда. Можно сначала скачать JSON.",
      confirmLabel: "Удалить навсегда",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/characters/${row.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) return toast.error("Не удалось удалить");
    setRows((r) => r.filter((x) => x.id !== row.id));
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Персонажи</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/characters/import">
              <FileUp /> Импорт
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link href="/characters/new">
              <Plus /> Новый персонаж
            </Link>
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<Users />} title="Здесь пока пусто">
          Создайте персонажа с нуля или загрузите экспорт из Long Story Short: бонусы, предметы и заметки перенесутся вместе с ним.
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="primary">
              <Link href="/characters/new">
                <Plus /> Создать
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/characters/import">
                <FileUp /> Импортировать
              </Link>
            </Button>
          </div>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.id} className="group relative flex items-center gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent">
              <Link href={`/characters/${row.id}`} className="absolute inset-0 rounded-xl" aria-label={`Открыть ${row.name}`} />
              <AvatarImage
                src={row.avatarUrl}
                className="size-14 shrink-0 rounded-lg object-cover"
                fallback={
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-panel-3 text-faint">
                    <UserRound className="size-7" />
                  </div>
                }
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-bold group-hover:text-accent">{row.name}</div>
                <div className="truncate text-sm text-muted" title={row.summary || undefined}>
                  {row.summary || "Без расы и класса"}
                </div>
                <div className="text-xs text-faint" suppressHydrationWarning>
                  Изменён {relativeTime(row.updatedAt)}
                </div>
              </div>
              <div className="relative">
                <Menu
                  trigger={
                    <Button size="icon-sm" variant="ghost" aria-label="Действия">
                      <MoreVertical />
                    </Button>
                  }
                  items={[
                    { label: "Сделать копию", icon: <Copy />, onSelect: () => void duplicate(row) },
                    { label: "Скачать JSON", icon: <Download />, onSelect: () => void exportOne(row) },
                    "separator",
                    { label: "Удалить", icon: <Trash2 />, danger: true, onSelect: () => void remove(row) },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
