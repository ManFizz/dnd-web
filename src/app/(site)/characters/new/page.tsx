import type { Metadata } from "next";
import { CreateWizard } from "@/components/characters/create-wizard";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Новый персонаж" };

export default async function NewCharacterPage() {
  await requireUser("/characters/new");
  return <CreateWizard />;
}
