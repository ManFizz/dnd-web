import { z } from "zod";
import { CharacterEventInputSchema } from "@/lib/events";
import { CharacterDocSchema } from "@/lib/rules/schema";
import { createCharacter, listCharacters } from "@/lib/server/characters";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  return Response.json({ characters: await listCharacters(user.id) });
});

const CreateSchema = z.object({
  doc: CharacterDocSchema,
  events: z.array(CharacterEventInputSchema).max(500).default([]),
});

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  const body = await readJson(req, CreateSchema);
  const created = await createCharacter(user.id, body.doc, body.events);
  return Response.json(created, { status: 201 });
});
