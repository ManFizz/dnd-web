import { z } from "zod";
import { LootTableInputSchema } from "@/lib/loot";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { addStarterTables, createLootTable, listLootTables } from "@/lib/server/loot";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/tables">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ tables: await listLootTables(id, user.id) });
});

const PostSchema = z.union([z.object({ starter: z.literal(true) }), LootTableInputSchema]);

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/tables">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, PostSchema, 512 * 1024);
  if ("starter" in body) {
    await addStarterTables(id, user.id);
    return new Response(null, { status: 204 });
  }
  return Response.json(await createLootTable(id, user.id, body), { status: 201 });
});
