import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SheetApp } from "@/components/sheet/sheet-app";
import { getCharacter } from "@/lib/server/characters";
import { HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const load = cache(async (id: string) => {
  const user = await requireUser(`/characters/${id}`);
  try {
    return await getCharacter(id, user.id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata(props: PageProps<"/characters/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const character = await load(id);
  return { title: character.doc.name || "Персонаж" };
}

export default async function CharacterPage(props: PageProps<"/characters/[id]">) {
  const { id } = await props.params;
  const { tab } = await props.searchParams;
  const character = await load(id);
  return <SheetApp id={character.id} doc={character.doc} version={character.version} initialTab={typeof tab === "string" ? tab : undefined} />;
}
