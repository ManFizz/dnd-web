import { z } from "zod";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { matchSpellNames } from "@/lib/server/spells";

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  const body = await readJson(req, z.object({ names: z.array(z.string().max(300)).max(1000), edition: z.enum(["2014", "2024"]).optional() }));
  return Response.json({ matches: await matchSpellNames(user, body.names, body.edition) });
});
