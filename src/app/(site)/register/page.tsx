import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/site/auth-form";
import { enabledSocialProviders } from "@/lib/server/auth";
import { getSessionUser } from "@/lib/server/session";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const sp = await props.searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser()) redirect(next);
  return <AuthForm mode="register" next={next} providers={enabledSocialProviders()} />;
}
