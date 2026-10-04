"use client";

import { Check, ExternalLink, Plus, RotateCcw, Send, Undo2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CHARACTER_STATUS_LABELS, type CampaignCharacterRow, type CampaignDetail } from "@/lib/campaigns";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Button } from "@/components/ui/button";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";

// Lobby pieces around characters: the GM's review queue, the player's own
// characters, the public party list and the "bring a character" dialog.

type FreeCharacter = {
  id: string;
  name: string;
  summary: string;
  avatarUrl: string;
};

function Portrait({ src, size = "size-10" }: { src: string; size?: string }) {
  return (
    <AvatarImage
      src={src}
      className={`${size} shrink-0 rounded-lg object-cover`}
      fallback={
        <div className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-panel-3 text-faint`}>
          <UserRound className="size-5" />
        </div>
      }
    />
  );
}

function useRun(onChanged: () => void) {
  return async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };
}

export function BringCharacterDialog({
  campaignId,
  open,
  onOpenChange,
  onChanged,
  needsApproval,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  needsApproval: boolean;
}) {
  const [list, setList] = useState<FreeCharacter[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ characters: FreeCharacter[] }>(`/api/campaigns/${campaignId}/characters`)
      .then((r) => alive && setList(r.characters))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Не удалось загрузить персонажей");
        if (alive) setList([]);
      });
    return () => {
      alive = false;
      setList(null);
    };
  }, [open, campaignId]);
  const bring = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/characters`, {
        method: "POST",
        body: { characterId: id },
      });
      toast.success(needsApproval ? "Персонаж отправлен ГМу на проверку" : "Персонаж в партии");
      onOpenChange(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось привести персонажа");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Привести персонажа"
      description={
        needsApproval
          ? "ГМ проверит лист, прежде чем персонаж войдёт в партию. Персонаж может состоять только в одной кампании."
          : "Персонаж сразу войдёт в партию. Он может состоять только в одной кампании."
      }
    >
      {list === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <Empty icon={<UserRound />} title="Свободных персонажей нет">
          Все ваши персонажи уже в кампаниях. Создайте нового или импортируйте лист.
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild variant="primary">
              <Link href="/characters/new">
                <Plus /> Создать персонажа
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/characters/import">Импорт</Link>
            </Button>
          </div>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => bring(c.id)}
              className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-2 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <Portrait src={c.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted">{c.summary || "Без описания"}</div>
              </div>
              <Send className="size-4 text-accent" />
            </button>
          ))}
          <Link href="/characters/new" className="mt-2 text-center text-sm text-accent hover:underline">
            Или создать нового персонажа
          </Link>
        </div>
      )}
    </Modal>
  );
}

/** GM: characters waiting for approval or sent back for fixes. */
export function ReviewQueue({ detail, onChanged }: { detail: CampaignDetail; onChanged: () => void }) {
  const ask = useAsk();
  const run = useRun(onChanged);
  const waiting = detail.characters.filter((c) => c.status === "pending");
  const returned = detail.characters.filter((c) => c.status === "returned");
  if (!waiting.length && !returned.length) return null;
  const url = (c: CampaignCharacterRow) => `/api/campaigns/${detail.id}/characters/${c.id}`;
  const sendBack = async (c: CampaignCharacterRow) => {
    const note = await ask.text({
      title: `Вернуть ${c.name} на доработку`,
      description: "Игрок увидит ваш комментарий рядом с персонажем.",
      label: "Что поправить",
      placeholder: "Например: характеристики по стандартному набору, без кубов",
      required: true,
      confirmLabel: "Вернуть",
    });
    if (note) run(() => api(url(c), { method: "PATCH", body: { action: "return", note } }), "Персонаж возвращён игроку");
  };
  const reject = async (c: CampaignCharacterRow) => {
    const ok = await ask.confirm({
      title: `Убрать ${c.name} из кампании?`,
      description: "Лист останется у игрока, он сможет привести другого персонажа.",
      confirmLabel: "Убрать",
      danger: true,
    });
    if (ok) run(() => api(url(c), { method: "DELETE" }));
  };
  return (
    <Panel title={`Проверка персонажей (${waiting.length})`}>
      <div className="flex flex-col gap-1.5">
        {[...waiting, ...returned].map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-panel-2 p-2">
            <Portrait src={c.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {c.name} <span className="text-xs font-normal text-faint">· {c.ownerName}</span>
              </div>
              <div className="truncate text-xs text-muted">{c.summary || "Без описания"}</div>
              {c.status === "returned" && (
                <div className="mt-0.5 text-xs text-info">
                  {CHARACTER_STATUS_LABELS.returned}: {c.note}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button asChild size="xs" variant="outline">
                <Link href={`/characters/${c.characterId}`}>
                  <ExternalLink /> Лист
                </Link>
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={() =>
                  run(
                    () =>
                      api(url(c), {
                        method: "PATCH",
                        body: { action: "accept" },
                      }),
                    `${c.name} в партии`,
                  )
                }
              >
                <Check /> Принять
              </Button>
              {c.status === "pending" && (
                <Button size="xs" variant="secondary" onClick={() => sendBack(c)}>
                  <Undo2 /> Вернуть
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" aria-label={`Убрать ${c.name}`} onClick={() => reject(c)}>
                <X />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Player: own characters in this campaign, with their review state. */
export function MyCharacters({ detail, onChanged, onBring }: { detail: CampaignDetail; onChanged: () => void; onBring: () => void }) {
  const ask = useAsk();
  const run = useRun(onChanged);
  const mine = detail.characters.filter((c) => c.mine);
  if (detail.me.role === "spectator") return null;
  const url = (c: CampaignCharacterRow) => `/api/campaigns/${detail.id}/characters/${c.id}`;
  const leave = async (c: CampaignCharacterRow) => {
    const ok = await ask.confirm({
      title: `Вывести ${c.name} из кампании?`,
      description: "Лист останется у вас. Чтобы вернуться, персонажа снова придётся привести.",
      confirmLabel: "Вывести",
      danger: true,
    });
    if (ok) run(() => api(url(c), { method: "DELETE" }));
  };
  return (
    <Panel
      title="Мои персонажи"
      actions={
        <Button size="xs" variant={mine.length ? "ghost" : "primary"} onClick={onBring}>
          <Plus /> Привести персонажа
        </Button>
      }
    >
      {mine.length === 0 ? (
        <p className="text-sm text-muted">Вы ещё не привели персонажа. ГМ увидит его лист, а остальные игроки только имя, портрет и класс.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {mine.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-panel-2 p-2">
              <Portrait src={c.avatarUrl} />
              <div className="min-w-0 flex-1">
                <Link href={`/characters/${c.characterId}`} className="block truncate font-medium hover:text-accent">
                  {c.name}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={c.status === "accepted" ? "good" : c.status === "returned" ? "danger" : "info"}>{CHARACTER_STATUS_LABELS[c.status]}</Badge>
                  <span className="truncate">{c.summary}</span>
                </div>
                {c.status === "returned" && c.note && <div className="mt-1 text-sm whitespace-pre-line">ГМ: {c.note}</div>}
              </div>
              <div className="flex gap-1">
                {c.status === "returned" && (
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={() =>
                      run(
                        () =>
                          api(url(c), {
                            method: "PATCH",
                            body: { action: "resubmit" },
                          }),
                        "Отправлено ГМу",
                      )
                    }
                  >
                    <RotateCcw /> Отправить снова
                  </Button>
                )}
                <Button size="icon-sm" variant="ghost" aria-label={`Вывести ${c.name}`} onClick={() => leave(c)}>
                  <X />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** What players and spectators see of the party: names, portraits and classes only. */
export function PartyRoster({ detail }: { detail: CampaignDetail }) {
  const party = detail.characters.filter((c) => c.status === "accepted");
  if (!party.length) {
    return (
      <Empty icon={<UserRound />} title="Партия пока пуста">
        Персонажи появятся здесь, когда ГМ примет их в партию.
      </Empty>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {party.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
          <Portrait src={c.avatarUrl} size="size-14" />
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold">{c.name}</div>
            <div className="truncate text-xs text-muted">{c.summary || "Без описания"}</div>
            <div className="truncate text-[11px] text-faint">Игрок: {c.ownerName}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
