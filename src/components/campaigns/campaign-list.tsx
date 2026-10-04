"use client";

import { CalendarDays, Crown, Hourglass, Plus, Swords, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, type CampaignListItem } from "@/lib/campaigns";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Empty } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { api } from "./api";
import { formatSession } from "./format";

function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/campaigns", {
        method: "POST",
        body: { name, description },
      });
      router.push(`/campaigns/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать кампанию");
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Новая кампания"
      description="Вы станете её ГМом. Игроков позовёте ссылкой-приглашением."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button variant="primary" type="submit" form="create-campaign" disabled={busy || !name.trim()}>
            Создать
          </Button>
        </>
      }
    >
      <form id="create-campaign" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Название" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="Проклятие Страда" />
        </Field>
        <Field label="Коротко о кампании" hint="Игроки увидят это в приглашении">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </Field>
      </form>
    </Modal>
  );
}

export function CampaignList({ initial }: { initial: CampaignListItem[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Кампании</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus /> Новая кампания
        </Button>
      </div>
      {initial.length === 0 ? (
        <Empty icon={<Swords />} title="Вы пока не в кампании">
          Создайте свою кампанию и позовите игроков ссылкой, или откройте приглашение, которое прислал ваш ГМ.
          <div className="mt-4">
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> Создать кампанию
            </Button>
          </div>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="group flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 truncate font-display text-lg font-bold group-hover:text-accent">{c.name}</div>
                {c.status === "pending" ? (
                  <Badge tone="info">
                    <Hourglass className="size-3" /> Ждёт одобрения
                  </Badge>
                ) : (
                  <Badge tone={c.role === "gm" ? "accent" : "neutral"}>
                    {c.role === "gm" && <Crown className="size-3" />}
                    {ROLE_LABELS[c.role]}
                  </Badge>
                )}
              </div>
              {c.description && <p className="line-clamp-2 text-sm text-muted">{c.description}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                <span>ГМ: {c.ownerName}</span>
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" /> {c.memberCount}
                </span>
                <span>Персонажей: {c.characterCount}</span>
                {c.nextSession && (
                  <span className="flex items-center gap-1 text-muted" suppressHydrationWarning>
                    <CalendarDays className="size-3.5" /> {formatSession(c.nextSession)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      <CreateCampaignDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
