import { MapActionSchema, MapInputSchema } from "@/lib/maps";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { deleteMap, mapAction, updateMap } from "@/lib/server/maps";

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps/[mapId]">) => {
  const user = await requireApiUser(req);
  const { id, mapId } = await ctx.params;
  await updateMap(id, mapId, user.id, await readJson(req, MapInputSchema, 1024 * 1024));
  return new Response(null, { status: 204 });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps/[mapId]">) => {
  const user = await requireApiUser(req);
  const { id, mapId } = await ctx.params;
  await mapAction(id, mapId, user.id, await readJson(req, MapActionSchema, 256 * 1024));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps/[mapId]">) => {
  const user = await requireApiUser(req);
  const { id, mapId } = await ctx.params;
  await deleteMap(id, mapId, user.id);
  return new Response(null, { status: 204 });
});
