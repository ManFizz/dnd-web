import { QuickActionSchema } from "@/lib/grants";
import { quickAction } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/actions">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await quickAction(id, user.id, await readJson(req, QuickActionSchema, 16 * 1024)));
});
