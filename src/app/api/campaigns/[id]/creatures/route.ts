import { CustomCreatureSchema } from "@/lib/bestiary";
import { createCustomCreature } from "@/lib/server/bestiary";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/creatures">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createCustomCreature(id, user.id, await readJson(req, CustomCreatureSchema, 512 * 1024)), { status: 201 });
});
