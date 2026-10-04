import type { Metadata } from "next";
import { BestiaryImport } from "@/components/bestiary/bestiary-import";
import { Empty } from "@/components/ui/misc";
import { isAdmin, requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Загрузка бестиария" };

export default async function BestiaryImportPage() {
  const user = await requireUser("/bestiary/import");
  if (!isAdmin(user)) {
    return (
      <Empty title="Только для администратора" className="mx-auto max-w-xl">
        Общий бестиарий наполняет администратор сайта. Своих существ ГМ добавляет во вкладке «Бестиарий» своей кампании: их видят только ГМы этой кампании.
      </Empty>
    );
  }
  return <BestiaryImport />;
}
