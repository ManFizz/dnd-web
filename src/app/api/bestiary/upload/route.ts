import { z } from "zod";
import { normalizeBestiaryUpload, upsertParsedCreatures } from "@/lib/server/bestiary";
import { handler, HttpError, readJson, requireApiUser } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  if (!isAdmin(user)) throw new HttpError(403, "Загружать общий бестиарий может только администратор");
  // Big files come in chunks, like the spell upload.
  const body = await readJson(req, z.object({ data: z.unknown() }));
  const { creatures, rejected } = normalizeBestiaryUpload(body.data);
  return Response.json({ ...(await upsertParsedCreatures(creatures)), rejected });
});
