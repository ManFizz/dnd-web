import { SessionInputSchema } from "@/lib/sessions";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { createSession, listSessions } from "@/lib/server/sessions";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/sessions">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ sessions: await listSessions(id, user.id) });
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/sessions">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await createSession(id, user.id, await readJson(req, SessionInputSchema, 256 * 1024)), { status: 201 });
});
