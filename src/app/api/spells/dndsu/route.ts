import { z } from "zod";
import { fetchSpells, discoverDndSu } from "@/lib/server/dndsu";
import { handler, HttpError, readJson, requireApiUser } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/session";
import { upsertParsedSpells } from "@/lib/server/spells";

export const maxDuration = 60;

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("discover"), sources: z.array(z.enum(["dndsu", "dndsu-homebrew", "next-dndsu"])).min(1).max(3) }),
  z.object({ action: z.literal("import"), urls: z.array(z.string().url().max(500)).min(1).max(12) }),
]);

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  if (!isAdmin(user)) throw new HttpError(403, "Импортировать заклинания может только администратор");
  const body = await readJson(req, BodySchema);
  if (body.action === "discover") {
    try {
      return Response.json({ urls: await discoverDndSu(body.sources) });
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : "dnd.su недоступен");
    }
  }
  const results = await fetchSpells(body.urls);
  const spells = results.flatMap((r) => (r.spell ? [r.spell] : []));
  const saved = await upsertParsedSpells(spells);
  return Response.json({
    ...saved,
    results: results.map((r) => ({ url: r.url, ok: Boolean(r.spell), name: r.spell?.nameRu, error: r.error })),
  });
});
