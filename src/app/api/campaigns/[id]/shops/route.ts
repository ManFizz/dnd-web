import { ShopInputSchema } from "@/lib/shop";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { createShop, listShops } from "@/lib/server/shops";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/shops">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ shops: await listShops(id, user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/shops">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createShop(id, user.id, await readJson(req, ShopInputSchema, 512 * 1024)), { status: 201 });
});
