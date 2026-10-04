import { joinByCode, previewInvite } from "@/lib/server/campaigns";
import { handler, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/invites/[code]">) => {
  const user = await requireApiUser(req);
  const { code } = await ctx.params;
  return Response.json(await previewInvite(code, user.id));
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/invites/[code]">) => {
  const user = await requireApiUser(req);
  const { code } = await ctx.params;
  return Response.json(await joinByCode(code, user.id));
});
