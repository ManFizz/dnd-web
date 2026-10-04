import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { lootDraftAction, LootDraftActionSchema } from "@/lib/server/loot";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/loot/drafts/[draftId]">) => {
  const user = await requireApiUser(req);
  const { id, draftId } = await ctx.params;
  await lootDraftAction(id, draftId, user.id, await readJson(req, LootDraftActionSchema, 512 * 1024));
  return new Response(null, { status: 204 });
});
