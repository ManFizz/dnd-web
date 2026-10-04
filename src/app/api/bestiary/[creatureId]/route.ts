import { getCreature } from "@/lib/server/bestiary";
import { handler, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/bestiary/[creatureId]">) => {
  const user = await requireApiUser(req);
  const { creatureId } = await ctx.params;
  return Response.json({ creature: await getCreature(user.id, creatureId) });
});
