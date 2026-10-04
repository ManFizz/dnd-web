"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

type Provider = "google" | "discord";

const PROVIDER_LABELS: Record<Provider, string> = { google: "Google", discord: "Discord" };

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Неверная почта или пароль",
  INVALID_EMAIL: "Некорректная почта",
  INVALID_PASSWORD: "Неверный пароль",
  USER_ALREADY_EXISTS: "Аккаунт с этой почтой уже есть. Попробуйте войти.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Аккаунт с этой почтой уже есть. Попробуйте войти.",
  PASSWORD_TOO_SHORT: "Пароль слишком короткий: нужно не меньше 8 символов",
  PASSWORD_TOO_LONG: "Пароль слишком длинный",
  EMAIL_NOT_VERIFIED: "Почта не подтверждена",
};

function errorText(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Что-то пошло не так";
  if (error.code && ERRORS[error.code]) return ERRORS[error.code];
  if (error.status === 429) return "Слишком много попыток, подождите немного";
  return error.message || "Что-то пошло не так";
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#5865F2"
        d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.7 19.7 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12.1 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.6 19.6 0 0 0 6-3c.5-5.2-.8-9.7-3.3-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.4 8 10.4s2.2 1.1 2.2 2.5-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.4-2.2 2.4z"
      />
    </svg>
  );
}

export function AuthForm({ mode, next, providers, oauthError }: { mode: "login" | "register"; next: string; providers: Provider[]; oauthError?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(oauthError ? "Не удалось войти через внешний сервис. Попробуйте ещё раз." : null);
  const register = mode === "register";
  const query = next !== "/characters" ? `?next=${encodeURIComponent(next)}` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("email");
    setError(null);
    const res = register
      ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email: email.trim(), password })
      : await authClient.signIn.email({ email: email.trim(), password });
    if (res.error) {
      setBusy(null);
      setError(errorText(res.error));
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const social = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    const res = await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: `/login?error=oauth${query ? `&${query.slice(1)}` : ""}` });
    if (res.error) {
      setBusy(null);
      setError(errorText(res.error));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 py-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{register ? "Регистрация" : "Вход"}</h1>
        <p className="mt-1 text-sm text-muted">{register ? "Аккаунт нужен, чтобы персонажи хранились на сервере и открывались с любого устройства." : "С возвращением, искатель приключений."}</p>
      </div>
      {providers.length > 0 && (
        <div className="flex flex-col gap-2">
          {providers.map((p) => (
            <Button key={p} variant="outline" size="lg" onClick={() => social(p)} disabled={busy !== null}>
              {busy === p ? <Loader2 className="animate-spin" /> : <ProviderIcon provider={p} />}
              Продолжить через {PROVIDER_LABELS[p]}
            </Button>
          ))}
          <div className="my-1 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            или по почте
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        {register && (
          <Field label="Имя">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" placeholder="Как вас называть" maxLength={100} />
          </Field>
        )}
        <Field label="Почта" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" />
        </Field>
        <Field label="Пароль" required hint={register ? "Не меньше 8 символов" : undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 8 : undefined}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={busy !== null}>
          {busy === "email" && <Loader2 className="animate-spin" />}
          {register ? "Создать аккаунт" : "Войти"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {register ? "Уже есть аккаунт? " : "Нет аккаунта? "}
        <Link href={`${register ? "/login" : "/register"}${query}`} className="font-medium text-accent hover:underline">
          {register ? "Войти" : "Зарегистрироваться"}
        </Link>
      </p>
    </div>
  );
}
