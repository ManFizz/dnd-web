import type { Metadata } from "next";
import { headers } from "next/headers";
import { AccountSettings } from "@/components/site/account-settings";
import { firstParam } from "@/lib/auth-errors";
import { auth, enabledSocialProviders } from "@/lib/server/auth";
import { isAdmin, requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Аккаунт" };

export default async function AccountPage(props: PageProps<"/account">) {
  const user = await requireUser("/account");
  const sp = await props.searchParams;
  const accounts = await auth.api.listUserAccounts({ headers: await headers() });
  return (
    <AccountSettings
      user={{ name: user.name, email: user.email }}
      linked={accounts.map((a) => ({ id: a.id, providerId: a.providerId }))}
      providers={enabledSocialProviders()}
      error={firstParam(sp.error)}
      justLinked={firstParam(sp.linked)}
      admin={isAdmin(user)}
    />
  );
}
