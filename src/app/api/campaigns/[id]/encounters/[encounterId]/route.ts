import { EncounterActionSchema } from "@/lib/encounter";
import { deleteEncounter, encounterAction } from "@/lib/server/encounters";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/encounters/[encounterId]">) => {
  const user = await requireApiUser(req);
  const { id, encounterId } = await ctx.params;
  await encounterAction(id, encounterId, user.id, await readJson(req, EncounterActionSchema, 64 * 1024));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/encounters/[encounterId]">) => {
  const user = await requireApiUser(req);
  const { id, encounterId } = await ctx.params;
  await deleteEncounter(id, encounterId, user.id);
  return new Response(null, { status: 204 });
});
