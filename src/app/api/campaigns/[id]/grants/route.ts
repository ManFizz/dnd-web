import { GrantInputSchema } from "@/lib/grants";
import { createGrants, listGrants } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/grants">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ grants: await listGrants(id, user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/grants">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createGrants(id, user.id, await readJson(req, GrantInputSchema, 1024 * 1024)), { status: 201 });
});
