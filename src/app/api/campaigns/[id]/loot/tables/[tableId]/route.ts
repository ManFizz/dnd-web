import { LootTableInputSchema } from "@/lib/loot";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { deleteLootTable, updateLootTable } from "@/lib/server/loot";

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/tables/[tableId]">) => {
  const user = await requireApiUser(req);
  const { id, tableId } = await ctx.params;
  await updateLootTable(id, tableId, user.id, await readJson(req, LootTableInputSchema, 512 * 1024));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/tables/[tableId]">) => {
  const user = await requireApiUser(req);
  const { id, tableId } = await ctx.params;
  await deleteLootTable(id, tableId, user.id);
  return new Response(null, { status: 204 });
});
