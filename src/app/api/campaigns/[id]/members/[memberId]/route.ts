import { z } from "zod";
import { ASSIGNABLE_ROLES } from "@/lib/campaigns";
import { removeMember, updateMember } from "@/lib/server/campaigns";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

const PatchSchema = z.object({ role: z.enum(ASSIGNABLE_ROLES).optional(), approve: z.boolean().optional() });

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/members/[memberId]">) => {
  const user = await requireApiUser(req);
  const { id, memberId } = await ctx.params;
  await updateMember(id, memberId, user.id, await readJson(req, PatchSchema, 4096));
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/members/[memberId]">) => {
  const user = await requireApiUser(req);
  const { id, memberId } = await ctx.params;
  await removeMember(id, memberId, user.id);
  return new Response(null, { status: 204 });
});
