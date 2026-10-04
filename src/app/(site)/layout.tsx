import { SiteHeader } from "@/components/site/site-header";
import { getSessionUser, isAdmin } from "@/lib/server/session";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader user={user ? { name: user.name, email: user.email, image: user.image, isAdmin: isAdmin(user) } : null} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
