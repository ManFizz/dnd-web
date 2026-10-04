import { GrantResponseSchema } from "@/lib/grants";
import { respondGrant } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/grants/[grantId]/respond">) => {
  const user = await requireApiUser(req);
  const { id, grantId } = await ctx.params;
  await respondGrant(id, grantId, user.id, await readJson(req, GrantResponseSchema, 4096));
  return new Response(null, { status: 204 });
});
