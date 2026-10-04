import { z } from "zod";
import { upsertParsedCreatures } from "@/lib/server/bestiary";
import { discoverBestiary, fetchCreatures } from "@/lib/server/dndsu";
import { handler, HttpError, readJson, requireApiUser } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/session";

export const maxDuration = 60;

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("discover"),
    sources: z
      .array(z.enum(["dndsu", "dndsu-homebrew"]))
      .min(1)
      .max(2),
  }),
  z.object({ action: z.literal("import"), urls: z.array(z.string().url().max(500)).min(1).max(12) }),
]);

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  if (!isAdmin(user)) throw new HttpError(403, "Импортировать бестиарий может только администратор");
  const body = await readJson(req, BodySchema);
  if (body.action === "discover") {
    try {
      return Response.json({ urls: await discoverBestiary(body.sources) });
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : "dnd.su недоступен");
    }
  }
  const results = await fetchCreatures(body.urls);
  const saved = await upsertParsedCreatures(results.flatMap((r) => (r.creature ? [r.creature] : [])));
  return Response.json({
    ...saved,
    results: results.map((r) => ({ url: r.url, ok: Boolean(r.creature), name: r.creature?.nameRu, error: r.error })),
  });
});
