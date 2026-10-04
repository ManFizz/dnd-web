import { SessionActionSchema } from "@/lib/sessions";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { sessionAction } from "@/lib/server/sessions";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/sessions/[sessionId]">) => {
  const user = await requireApiUser(req);
  const { id, sessionId } = await ctx.params;
  await sessionAction(id, sessionId, user.id, await readJson(req, SessionActionSchema, 256 * 1024));
  return new Response(null, { status: 204 });
});
