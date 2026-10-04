import type { Metadata } from "next";
import { CharacterList } from "@/components/characters/character-list";
import { listCharacters } from "@/lib/server/characters";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Персонажи" };

export default async function CharactersPage() {
  const user = await requireUser("/characters");
  const characters = await listCharacters(user.id);
  return <CharacterList initial={characters} />;
}
