import { BuySchema } from "@/lib/shop";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { buy } from "@/lib/server/shops";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/shops/[shopId]/buy">) => {
  const user = await requireApiUser(req);
  const { id, shopId } = await ctx.params;
  await buy(id, shopId, user.id, await readJson(req, BuySchema, 4096));
  return new Response(null, { status: 204 });
});
