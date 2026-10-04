import type { NextRequest } from "next/server";
import { listEvents } from "@/lib/server/characters";
import { handler, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: NextRequest, ctx: RouteContext<"/api/characters/[id]/events">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const result = await listEvents(id, user.id, {
    cursor: sp.get("cursor") ?? undefined,
    limit: Number(sp.get("limit") ?? 50),
    kind: sp.get("kind") ?? undefined,
    q: sp.get("q") ?? undefined,
  });
  return Response.json(result);
});
