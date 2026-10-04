import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { listLootDrafts, rollLoot, RollLootSchema } from "@/lib/server/loot";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/drafts">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ drafts: await listLootDrafts(id, user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/drafts">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await rollLoot(id, user.id, await readJson(req, RollLootSchema, 4096)), { status: 201 });
});
