import { GrantPatchSchema } from "@/lib/grants";
import { updateGrant } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/grants/[grantId]">) => {
  const user = await requireApiUser(req);
  const { id, grantId } = await ctx.params;
  await updateGrant(id, grantId, user.id, await readJson(req, GrantPatchSchema, 16 * 1024));
  return new Response(null, { status: 204 });
});
