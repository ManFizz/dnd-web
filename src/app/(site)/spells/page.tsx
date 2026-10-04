import type { Metadata } from "next";
import { SpellLibrary } from "@/components/spells/spell-library";
import { isAdmin, requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Заклинания" };

export default async function SpellsPage() {
  const user = await requireUser("/spells");
  return <SpellLibrary userId={user.id} isAdmin={isAdmin(user)} />;
}
