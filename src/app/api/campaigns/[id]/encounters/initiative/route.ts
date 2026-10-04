import { PlayerInitiativeInput, setPlayerInitiative } from "@/lib/server/encounters";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/encounters/initiative">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await setPlayerInitiative(id, user.id, await readJson(req, PlayerInitiativeInput, 4096));
  return new Response(null, { status: 204 });
});
