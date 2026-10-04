import { secretRoll, SecretRollSchema } from "@/lib/server/encounters";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/secret-roll">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await secretRoll(id, user.id, await readJson(req, SecretRollSchema, 8192)));
});
