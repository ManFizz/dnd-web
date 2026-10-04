import { CampaignInputSchema } from "@/lib/campaigns";
import { createCampaign, listCampaigns } from "@/lib/server/campaigns";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  return Response.json({ campaigns: await listCampaigns(user.id) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  const body = await readJson(req, CampaignInputSchema, 64 * 1024);
  return Response.json(await createCampaign(user.id, body), { status: 201 });
});
