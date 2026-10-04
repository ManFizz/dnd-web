import { CustomCreatureSchema } from "@/lib/bestiary";
import { deleteCustomCreature, updateCustomCreature } from "@/lib/server/bestiary";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/creatures/[creatureId]">) => {
  const user = await requireApiUser(req);
  const { id, creatureId } = await ctx.params;
  await updateCustomCreature(id, creatureId, user.id, await readJson(req, CustomCreatureSchema, 512 * 1024));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/creatures/[creatureId]">) => {
  const user = await requireApiUser(req);
  const { id, creatureId } = await ctx.params;
  await deleteCustomCreature(id, creatureId, user.id);
  return new Response(null, { status: 204 });
});
