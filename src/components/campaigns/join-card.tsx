"use client";

import { Crown, Swords, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, type InvitePreview } from "@/lib/campaigns";

import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { api } from "./api";

export function JoinCard({ preview }: { preview: InvitePreview | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!preview) {
    return (
      <Empty icon={<Swords />} title="Приглашение не найдено" className="mx-auto max-w-lg">
        Проверьте ссылку или попросите ГМа прислать новую.
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link href="/campaigns">К кампаниям</Link>
          </Button>
        </div>
      </Empty>
    );
  }
  const join = async () => {
    setBusy(true);
    try {
      const res = await api<{
        campaignId: string;
        status: "active" | "pending";
      }>(`/api/invites/${preview.code}`, { method: "POST" });
      if (res.status === "pending") toast.success("Заявка отправлена: ГМ должен её одобрить");
      router.push(`/campaigns/${res.campaignId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось вступить");
      setBusy(false);
    }
  };
  const member = preview.membership;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border border-line bg-panel p-6">
      <div className="text-sm text-muted">Вас приглашают в кампанию</div>
      <h1 className="font-display text-3xl font-bold">{preview.campaignName}</h1>
      {preview.description && <p className="text-sm whitespace-pre-line text-muted">{preview.description}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <Crown className="size-4 text-accent" /> ГМ: {preview.ownerName}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-4" /> Участников: {preview.memberCount}
        </span>
        <span>Роль: {ROLE_LABELS[preview.role]}</span>
      </div>
      {member ? (
        <>
          <p className="text-sm">{member.status === "pending" ? "Вы уже отправили заявку, ГМ ещё не ответил." : "Вы уже в этой кампании."}</p>
          <Button asChild variant="primary">
            <Link href={`/campaigns/${preview.campaignId}`}>Открыть кампанию</Link>
          </Button>
        </>
      ) : preview.problem ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{preview.problem}. Попросите ГМа прислать новую ссылку.</p>
      ) : (
        <>
          {preview.requireApproval && <p className="text-sm text-muted">После вступления ГМ должен будет одобрить заявку.</p>}
          <Button variant="primary" size="lg" onClick={join} disabled={busy}>
            {preview.requireApproval ? "Отправить заявку" : "Вступить"}
          </Button>
        </>
      )}
    </div>
  );
}
