import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/site/auth-form";
import { firstParam } from "@/lib/auth-errors";
import { enabledSocialProviders } from "@/lib/server/auth";
import { getSessionUser } from "@/lib/server/session";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser()) redirect(next);
  return <AuthForm mode="login" next={next} providers={enabledSocialProviders()} oauthError={firstParam(sp.error)} />;
}
