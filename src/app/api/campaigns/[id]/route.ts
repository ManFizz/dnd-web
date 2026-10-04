import { CampaignPatchSchema } from "@/lib/campaigns";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/server/campaigns";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await getCampaign(id, user.id));
});

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await updateCampaign(id, user.id, await readJson(req, CampaignPatchSchema, 64 * 1024));
  return Response.json(await getCampaign(id, user.id));
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await deleteCampaign(id, user.id);
  return new Response(null, { status: 204 });
});
