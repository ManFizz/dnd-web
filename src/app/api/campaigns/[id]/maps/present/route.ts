import { z } from "zod";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { presentMap } from "@/lib/server/maps";

const PresentSchema = z.object({ mapId: z.string().max(80).nullable() });

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps/present">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await presentMap(id, user.id, (await readJson(req, PresentSchema, 1024)).mapId);
  return new Response(null, { status: 204 });
});
