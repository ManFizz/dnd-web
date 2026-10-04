import { handler, requireApiUser } from "@/lib/server/http";
import { mapImage } from "@/lib/server/maps";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/maps/[mapId]/image">) => {
  const user = await requireApiUser(req);
  const { id, mapId } = await ctx.params;
  const img = await mapImage(id, mapId, user.id, new URL(req.url).searchParams.get("view") === "player");
  return new Response(new Uint8Array(img.data), {
    headers: {
      "content-type": img.mime,
      // URLs carry the image id and the fog key, so a cached copy is never stale.
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
