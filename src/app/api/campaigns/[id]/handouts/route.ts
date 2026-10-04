import { HandoutInputSchema } from "@/lib/sessions";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { createHandout, listHandouts } from "@/lib/server/sessions";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/handouts">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ handouts: await listHandouts(id, user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/handouts">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createHandout(id, user.id, await readJson(req, HandoutInputSchema, 1024 * 1024)), { status: 201 });
});
