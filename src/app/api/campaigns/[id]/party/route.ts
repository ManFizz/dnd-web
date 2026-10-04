import { getParty } from "@/lib/server/campaigns";
import { handler, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/party">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ party: await getParty(id, user.id) });
});
