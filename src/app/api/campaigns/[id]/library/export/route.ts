import { exportTemplates } from "@/lib/server/grants";
import { handler, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/library/export">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const file = await exportTemplates(id, user.id);
  return new Response(JSON.stringify(file, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="library.json"' },
  });
});
