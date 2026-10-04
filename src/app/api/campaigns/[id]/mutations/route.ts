import { z } from "zod";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { listMutationDrafts, rollMutations } from "@/lib/server/mutations";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/mutations">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ drafts: await listMutationDrafts(id, user.id) });
});

const RollSchema = z.object({
  characterId: z.string().min(1).max(80),
  minutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 365 * 10),
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/mutations">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, RollSchema, 4096);
  return Response.json(await rollMutations(id, user.id, body.characterId, body.minutes), { status: 201 });
});
