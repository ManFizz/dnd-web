import { handler, requireApiUser } from "@/lib/server/http";
import { readFile } from "@/lib/server/sessions";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/files/[fileId]">) => {
  const user = await requireApiUser(req);
  const { id, fileId } = await ctx.params;
  const f = await readFile(id, fileId, user.id);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-length": String(f.size),
      // Files never change: a new upload gets a new id.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
