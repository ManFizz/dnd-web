import { InviteInputSchema } from "@/lib/campaigns";
import { createInvite } from "@/lib/server/campaigns";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/invites">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createInvite(id, user.id, await readJson(req, InviteInputSchema, 4096)), { status: 201 });
});
