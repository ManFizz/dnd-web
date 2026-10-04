import { z } from "zod";
import { attachCharacter, freeCharacters, requireMember } from "@/lib/server/campaigns";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

/** The caller's characters that are not in any campaign yet. */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/characters">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await requireMember(id, user.id);
  return Response.json({ characters: await freeCharacters(user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/characters">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const { characterId } = await readJson(req, z.object({ characterId: z.string().min(1).max(80) }), 4096);
  await attachCharacter(id, user.id, characterId);
  return new Response(null, { status: 204 });
});
