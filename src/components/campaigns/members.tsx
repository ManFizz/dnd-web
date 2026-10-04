"use client";

import { Check, Copy, Crown, Link2, LogOut, Trash2, UserMinus, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ASSIGNABLE_ROLES, invitePath, ROLE_HINTS, ROLE_LABELS, type CampaignDetail, type CampaignInviteRow, type CampaignRole } from "@/lib/campaigns";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/input";
import { Badge, Panel } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { formatSession } from "./format";

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}));

const EXPIRY_OPTIONS = [
  { value: "24", label: "1 день" },
  { value: "168", label: "Неделя" },
  { value: "720", label: "Месяц" },
  { value: "", label: "Бессрочно" },
];

const USES_OPTIONS = [
  { value: "1", label: "1 человек" },
  { value: "5", label: "До 5 человек" },
  { value: "10", label: "До 10 человек" },
  { value: "", label: "Без ограничения" },
];

function inviteUrl(code: string): string {
  return `${window.location.origin}${invitePath(code)}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Ссылка скопирована");
  } catch {
    toast.error("Не удалось скопировать: выделите ссылку вручную");
  }
}

function InviteRow({ inv, campaignId, onChanged }: { inv: CampaignInviteRow; campaignId: string; onChanged: () => void }) {
  const ask = useAsk();
  const revoke = async () => {
    const ok = await ask.confirm({
      title: "Отозвать приглашение?",
      description: "Ссылка перестанет работать.",
      confirmLabel: "Отозвать",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/campaigns/${campaignId}/invites/${inv.id}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };
  const limits = [
    ROLE_LABELS[inv.role],
    inv.maxUses ? `использовано ${inv.uses} из ${inv.maxUses}` : `использовано ${inv.uses}`,
    inv.expiresAt ? `до ${formatSession(inv.expiresAt)}` : "бессрочно",
    inv.requireApproval ? "с одобрением" : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 px-3 py-2">
      <Link2 className="size-4 shrink-0 text-accent" />
      <code className="min-w-0 flex-1 truncate text-xs" suppressHydrationWarning>
        {typeof window === "undefined" ? invitePath(inv.code) : inviteUrl(inv.code)}
      </code>
      <span className="text-xs text-muted" suppressHydrationWarning>
        {limits.join(" · ")}
      </span>
      <div className="ml-auto flex gap-1">
        <Button size="xs" variant="outline" onClick={() => copyText(inviteUrl(inv.code))}>
          <Copy /> Копировать
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Отозвать" onClick={revoke}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function InvitePanel({ detail, onChanged }: { detail: CampaignDetail; onChanged: () => void }) {
  const [role, setRole] = useState<string>("player");
  const [expires, setExpires] = useState("168");
  const [uses, setUses] = useState("");
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const { code } = await api<{ code: string }>(`/api/campaigns/${detail.id}/invites`, {
        method: "POST",
        body: {
          role,
          requireApproval: approval,
          maxUses: uses ? Number(uses) : null,
          expiresInHours: expires ? Number(expires) : null,
        },
      });
      await copyText(inviteUrl(code));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать приглашение");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Приглашения">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Создайте ссылку и отправьте её игрокам в любой мессенджер. Чтобы вступить, им нужен аккаунт на сайте.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Роль">
            <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} />
          </Field>
          <Field label="Срок">
            <Select value={expires} onChange={(e) => setExpires(e.target.value)} options={EXPIRY_OPTIONS} />
          </Field>
          <Field label="Сколько людей">
            <Select value={uses} onChange={(e) => setUses(e.target.value)} options={USES_OPTIONS} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox checked={approval} onChange={(e) => setApproval(e.target.checked)} label="Вступление только после моего одобрения" />
          <Button variant="primary" onClick={create} disabled={busy}>
            <Link2 /> Создать и скопировать ссылку
          </Button>
        </div>
        {detail.invites.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {detail.invites.map((inv) => (
              <InviteRow key={inv.id} inv={inv} campaignId={detail.id} onChanged={onChanged} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function MembersTab({ detail, onChanged }: { detail: CampaignDetail; onChanged: () => void }) {
  const ask = useAsk();
  const router = useRouter();
  const owner = detail.me.role === "gm";
  const pending = detail.members.filter((m) => m.status === "pending");
  const active = detail.members.filter((m) => m.status === "active");

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };
  const setRole = (memberId: string, role: string) =>
    run(() =>
      api(`/api/campaigns/${detail.id}/members/${memberId}`, {
        method: "PATCH",
        body: { role },
      }),
    );
  const approve = (memberId: string) =>
    run(() =>
      api(`/api/campaigns/${detail.id}/members/${memberId}`, {
        method: "PATCH",
        body: { approve: true },
      }),
    );
  const remove = async (memberId: string, name: string, self: boolean) => {
    const ok = await ask.confirm(
      self
        ? {
            title: "Покинуть кампанию?",
            description: "Ваши персонажи тоже покинут партию. Сами листы останутся у вас.",
            confirmLabel: "Покинуть",
            danger: true,
          }
        : {
            title: `Исключить ${name}?`,
            description: "Персонажи игрока покинут партию, листы останутся у него.",
            confirmLabel: "Исключить",
            danger: true,
          },
    );
    if (!ok) return;
    try {
      await api(`/api/campaigns/${detail.id}/members/${memberId}`, {
        method: "DELETE",
      });
      if (self) router.push("/campaigns");
      else onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };
  const myMember = detail.members.find((m) => m.userId === detail.me.userId);

  return (
    <div className="flex flex-col gap-4">
      {owner && pending.length > 0 && (
        <Panel title={`Заявки на вступление (${pending.length})`}>
          <div className="flex flex-col gap-1.5">
            {pending.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 px-3 py-2">
                <span className="font-medium">{m.name}</span>
                <Badge>{ROLE_LABELS[m.role]}</Badge>
                <div className="ml-auto flex gap-1">
                  <Button size="xs" variant="primary" onClick={() => approve(m.id)}>
                    <Check /> Принять
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => remove(m.id, m.name, false)}>
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`Участники (${active.length})`}>
        <div className="flex flex-col divide-y divide-line">
          {active.map((m) => {
            const self = m.userId === detail.me.userId;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0">
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-full bg-panel-3 text-muted">
                    <UserRound className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {m.name}
                    {self && <span className="text-faint"> (вы)</span>}
                  </div>
                  <div className="text-xs text-faint">
                    {detail.characters
                      .filter((c) => c.userId === m.userId && c.status === "accepted")
                      .map((c) => c.name)
                      .join(", ")}
                  </div>
                </div>
                {owner && m.role !== "gm" ? (
                  <Tip content={ROLE_HINTS[m.role]}>
                    <span>
                      <Select
                        aria-label={`Роль ${m.name}`}
                        value={m.role}
                        onChange={(e) => setRole(m.id, e.target.value)}
                        options={ROLE_OPTIONS}
                        className="h-8 w-32"
                      />
                    </span>
                  </Tip>
                ) : (
                  <Tip content={ROLE_HINTS[m.role]}>
                    <span>
                      <Badge tone={m.role === "gm" ? "accent" : "neutral"}>
                        {m.role === "gm" && <Crown className="size-3" />}
                        {ROLE_LABELS[m.role as CampaignRole]}
                      </Badge>
                    </span>
                  </Tip>
                )}
                {owner && !self && m.role !== "gm" && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Исключить ${m.name}`} onClick={() => remove(m.id, m.name, false)}>
                    <UserMinus />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {owner && <InvitePanel detail={detail} onChanged={onChanged} />}

      {!owner && myMember && (
        <div>
          <Button variant="danger" onClick={() => remove(myMember.id, myMember.name, true)}>
            <LogOut /> Покинуть кампанию
          </Button>
        </div>
      )}
    </div>
  );
}
