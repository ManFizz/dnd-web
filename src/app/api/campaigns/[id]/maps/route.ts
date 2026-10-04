import { MapInputSchema } from "@/lib/maps";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { createMap, listMaps } from "@/lib/server/maps";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  // ?view=player: what the players see (the shared screen opened by the GM).
  return Response.json(await listMaps(id, user.id, new URL(req.url).searchParams.get("view") === "player"));
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createMap(id, user.id, await readJson(req, MapInputSchema, 1024 * 1024)), { status: 201 });
});
