import { z } from "zod";
import { createEncounter, listEncounters } from "@/lib/server/encounters";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/encounters">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await listEncounters(id, user.id));
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/encounters">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const { name } = await readJson(req, z.object({ name: z.string().max(200).default("") }), 4096);
  return Response.json(await createEncounter(id, user.id, name), { status: 201 });
});
