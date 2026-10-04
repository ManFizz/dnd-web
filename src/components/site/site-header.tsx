"use client";

import { BookOpenText, LogOut, ScrollText, Sparkles, Upload, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/app";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/overlay";

export type HeaderUser = { name: string; email: string; image?: string | null; isAdmin: boolean };

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = user
    ? [
        { href: "/characters", label: "Персонажи", icon: Users },
        { href: "/spells", label: "Заклинания", icon: Sparkles },
      ]
    : [];

  const signOut = async () => {
    const { error } = await authClient.signOut();
    if (error) return toast.error("Не удалось выйти");
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href={user ? "/characters" : "/"} className="mr-2 flex items-center gap-2 font-display text-lg font-bold">
          <ScrollText className="size-5 text-accent" />
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-muted hover:bg-panel-2 hover:text-text",
                )}
              >
                <Icon className="size-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <Menu
              trigger={
                <Button variant="ghost" className="max-w-56 gap-2 px-2" aria-label="Аккаунт">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-7 items-center justify-center rounded-full bg-panel-3 text-muted">
                      <UserRound className="size-4" />
                    </span>
                  )}
                  <span className="hidden truncate text-sm md:inline">{user.name || user.email}</span>
                </Button>
              }
              items={[
                { label: <span className="truncate text-muted">{user.email}</span>, onSelect: () => {}, disabled: true },
                "separator",
                { label: "Мои персонажи", icon: <Users />, onSelect: () => router.push("/characters") },
                { label: "Импорт из Long Story Short", icon: <BookOpenText />, onSelect: () => router.push("/characters/import") },
                ...(user.isAdmin ? [{ label: "Загрузка заклинаний", icon: <Upload />, onSelect: () => router.push("/spells/import") }] : []),
                "separator",
                { label: "Выйти", icon: <LogOut />, onSelect: signOut, danger: true },
              ]}
            />
          ) : (
            <Button asChild size="sm" variant="primary">
              <Link href="/login">Войти</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
