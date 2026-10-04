"use client";

import { Check, KeyRound, Link2, Loader2, Mail, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { oauthErrorText } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, Panel } from "@/components/ui/misc";

type Provider = "google" | "discord";

const PROVIDER_LABELS: Record<Provider, string> = { google: "Google", discord: "Discord" };

const PASSWORD_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "Текущий пароль указан неверно",
  PASSWORD_TOO_SHORT: "Пароль слишком короткий: нужно не меньше 8 символов",
  PASSWORD_TOO_LONG: "Пароль слишком длинный",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "У аккаунта ещё нет пароля",
};

function errorText(error: { code?: string; message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error.code && PASSWORD_ERRORS[error.code]) return PASSWORD_ERRORS[error.code];
  if (error.code === "FAILED_TO_UNLINK_LAST_ACCOUNT") return "Нельзя отключить последний способ входа";
  if (error.code === "SESSION_NOT_FRESH") return "Для этого действия войдите на сайт заново";
  if (error.status === 429) return "Слишком много попыток, подождите немного";
  return fallback;
}

function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = value.trim();
    if (!next || next === name) return;
    setBusy(true);
    const { error } = await authClient.updateUser({ name: next });
    setBusy(false);
    if (error) return toast.error(errorText(error, "Не удалось сохранить имя"));
    toast.success("Имя сохранено");
    router.refresh();
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <Field label="Почта" hint="По ней же входят с паролем">
        <Input value={email} readOnly disabled />
      </Field>
      <div className="flex items-end gap-2">
        <Field label="Имя" className="flex-1">
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={100} autoComplete="nickname" />
        </Field>
        <Button type="submit" variant="outline" disabled={busy || !value.trim() || value.trim() === name}>
          {busy && <Loader2 className="animate-spin" />} Сохранить
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (hasPassword) {
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: password, revokeOtherSessions: true });
      setBusy(false);
      if (error) return setError(errorText(error, "Не удалось сменить пароль"));
      toast.success("Пароль изменён. На других устройствах нужно войти заново.");
    } else {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      setBusy(false);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return setError(body?.error ?? "Не удалось задать пароль");
      }
      toast.success("Пароль задан: теперь можно входить и по почте");
      router.refresh();
    }
    setCurrent("");
    setPassword("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {hasPassword && (
        <Field label="Текущий пароль" required>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
      )}
      <Field label={hasPassword ? "Новый пароль" : "Пароль"} required hint="Не меньше 8 символов">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={busy || password.length < 8 || (hasPassword && !current)}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {hasPassword ? "Сменить пароль" : "Задать пароль"}
        </Button>
      </div>
    </form>
  );
}

export function AccountSettings({
  user,
  linked,
  providers,
  error,
  justLinked,
  admin,
}: {
  user: { name: string; email: string };
  linked: { id: string; providerId: string }[];
  providers: Provider[];
  error?: string;
  justLinked?: string;
  admin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const accountOf = (providerId: string) => linked.find((a) => a.providerId === providerId);
  const hasPassword = !!accountOf("credential");
  const linkError = oauthErrorText(error);
  const linkedLabel = justLinked && justLinked in PROVIDER_LABELS ? PROVIDER_LABELS[justLinked as Provider] : null;

  const link = async (provider: Provider) => {
    setBusy(provider);
    // Better Auth appends ?error=<code> to the error URL.
    const { error } = await authClient.linkSocial({ provider, callbackURL: `/account?linked=${provider}`, errorCallbackURL: "/account" });
    if (error) {
      setBusy(null);
      toast.error(errorText(error, `Не удалось подключить ${PROVIDER_LABELS[provider]}`));
    }
  };

  const unlink = async (provider: Provider) => {
    const account = accountOf(provider);
    if (!account) return;
    setBusy(provider);
    const { error } = await authClient.unlinkAccount({ accountId: account.id });
    setBusy(null);
    if (error) return toast.error(errorText(error, `Не удалось отключить ${PROVIDER_LABELS[provider]}`));
    toast.success(`${PROVIDER_LABELS[provider]} отключён`);
    router.refresh();
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Аккаунт</h1>
        <p className="mt-1 text-sm text-muted">Имя, способы входа и пароль. Персонажи привязаны к аккаунту, а не к способу входа.</p>
      </div>
      {linkError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {linkError}
        </p>
      )}
      {linkedLabel && !linkError && (
        <p className="flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          <Check className="size-4" /> {linkedLabel} подключён: теперь можно входить и через него.
        </p>
      )}

      <Panel title="Профиль">
        <ProfileForm name={user.name} email={user.email} />
      </Panel>

      <Panel title="Способы входа" bodyClassName="p-0">
        <div className="flex flex-col divide-y divide-line">
          <div className="flex items-center gap-3 px-4 py-3">
            <Mail className="size-5 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Почта и пароль</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
            {hasPassword ? <Badge tone="good">подключено</Badge> : <Badge>пароль не задан</Badge>}
          </div>
          {providers.map((p) => {
            const on = !!accountOf(p);
            return (
              <div key={p} className="flex items-center gap-3 px-4 py-3">
                <Link2 className="size-5 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                  <div className="text-xs text-muted">{on ? "Можно входить кнопкой на странице входа" : "Не подключён"}</div>
                </div>
                {on ? (
                  <Button size="sm" variant="ghost" onClick={() => unlink(p)} disabled={busy !== null || linked.length < 2}>
                    {busy === p ? <Loader2 className="animate-spin" /> : <Unlink />} Отключить
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => link(p)} disabled={busy !== null}>
                    {busy === p ? <Loader2 className="animate-spin" /> : <Link2 />} Подключить
                  </Button>
                )}
              </div>
            );
          })}
          {providers.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">
              Вход через Google и Discord на этом сервере не включён.
              {admin && " Чтобы включить, добавьте ключи GOOGLE_CLIENT_ID/SECRET и DISCORD_CLIENT_ID/SECRET в .env (подробно в README)."}
            </p>
          )}
        </div>
      </Panel>

      <Panel title={hasPassword ? "Сменить пароль" : "Задать пароль"}>
        {!hasPassword && (
          <p className="mb-3 text-sm text-muted">Аккаунт создан через Google или Discord. Задайте пароль, чтобы входить и по почте {user.email}.</p>
        )}
        <PasswordForm hasPassword={hasPassword} />
      </Panel>
    </div>
  );
}
