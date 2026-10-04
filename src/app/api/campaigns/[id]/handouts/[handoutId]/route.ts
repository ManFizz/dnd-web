import { HandoutInputSchema } from "@/lib/sessions";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { deleteHandout, updateHandout } from "@/lib/server/sessions";

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/handouts/[handoutId]">) => {
  const user = await requireApiUser(req);
  const { id, handoutId } = await ctx.params;
  await updateHandout(id, handoutId, user.id, await readJson(req, HandoutInputSchema, 1024 * 1024));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/handouts/[handoutId]">) => {
  const user = await requireApiUser(req);
  const { id, handoutId } = await ctx.params;
  await deleteHandout(id, handoutId, user.id);
  return new Response(null, { status: 204 });
});
