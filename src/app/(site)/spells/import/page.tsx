import type { Metadata } from "next";
import { SpellImport } from "@/components/spells/spell-import";
import { Empty } from "@/components/ui/misc";
import { isAdmin, requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Загрузка заклинаний" };

export default async function SpellImportPage() {
  const user = await requireUser("/spells/import");
  if (!isAdmin(user)) {
    return (
      <Empty title="Только для администратора" className="mx-auto max-w-xl">
        Общую библиотеку заклинаний наполняет администратор сайта: первый зарегистрированный пользователь или почта из переменной ADMIN_EMAILS. Свои заклинания
        можно создать на странице «Заклинания» или прямо в листе персонажа.
      </Empty>
    );
  }
  return <SpellImport />;
}
