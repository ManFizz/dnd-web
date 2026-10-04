import { z } from "zod";
import { detachCharacter, resubmitCharacter, reviewCharacter } from "@/lib/server/campaigns";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

const PatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("return"), note: z.string().trim().min(1, "Напишите, что поправить").max(2000) }),
  z.object({ action: z.literal("resubmit") }),
]);

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/characters/[linkId]">) => {
  const user = await requireApiUser(req);
  const { id, linkId } = await ctx.params;
  const body = await readJson(req, PatchSchema, 8192);
  if (body.action === "resubmit") await resubmitCharacter(id, linkId, user.id);
  else
    await reviewCharacter(id, linkId, user.id, {
      status: body.action === "accept" ? "accepted" : "returned",
      note: body.action === "return" ? body.note : "",
    });
  return new Response(null, { status: 204 });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/characters/[linkId]">) => {
  const user = await requireApiUser(req);
  const { id, linkId } = await ctx.params;
  await detachCharacter(id, linkId, user.id);
  return new Response(null, { status: 204 });
});
