import type { Metadata } from "next";
import { ImportCharacter } from "@/components/characters/import-character";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Импорт персонажа" };

export default async function ImportCharacterPage() {
  await requireUser("/characters/import");
  return <ImportCharacter />;
}
