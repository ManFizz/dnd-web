import { StashActionSchema } from "@/lib/grants";
import { getStash, stashAction } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/stash">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ stash: await getStash(id, user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/stash">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await stashAction(id, user.id, await readJson(req, StashActionSchema, 16 * 1024));
  return Response.json({ stash: await getStash(id, user.id) });
});
