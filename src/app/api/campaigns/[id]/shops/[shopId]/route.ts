import { ShopInputSchema } from "@/lib/shop";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { deleteShop, updateShop } from "@/lib/server/shops";

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/shops/[shopId]">) => {
  const user = await requireApiUser(req);
  const { id, shopId } = await ctx.params;
  await updateShop(id, shopId, user.id, await readJson(req, ShopInputSchema, 512 * 1024));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/shops/[shopId]">) => {
  const user = await requireApiUser(req);
  const { id, shopId } = await ctx.params;
  await deleteShop(id, shopId, user.id);
  return new Response(null, { status: 204 });
});
