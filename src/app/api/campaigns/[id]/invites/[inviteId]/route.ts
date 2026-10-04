import { revokeInvite } from "@/lib/server/campaigns";
import { handler, requireApiUser } from "@/lib/server/http";

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/invites/[inviteId]">) => {
  const user = await requireApiUser(req);
  const { id, inviteId } = await ctx.params;
  await revokeInvite(id, inviteId, user.id);
  return new Response(null, { status: 204 });
});
