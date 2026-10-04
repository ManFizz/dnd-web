import { z } from "zod";
import { normalizeSpellUpload } from "@/lib/import/dndsu/formats";
import { handler, HttpError, readJson, requireApiUser } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/session";
import { upsertParsedSpells } from "@/lib/server/spells";

export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  if (!isAdmin(user)) throw new HttpError(403, "Загружать общую библиотеку может только администратор");
  // The page uploads big files in chunks: hosting platforms cap request bodies at about 4 MB.
  const body = await readJson(req, z.object({ data: z.unknown() }));
  let normalized;
  try {
    normalized = normalizeSpellUpload(body.data);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Неверный файл");
  }
  const result = await upsertParsedSpells(normalized.spells);
  return Response.json({ ...result, rejected: normalized.rejected });
});
