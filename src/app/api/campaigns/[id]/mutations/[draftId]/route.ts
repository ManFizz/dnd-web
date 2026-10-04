import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { mutationDraftAction, MutationDraftActionSchema } from "@/lib/server/mutations";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/mutations/[draftId]">) => {
  const user = await requireApiUser(req);
  const { id, draftId } = await ctx.params;
  await mutationDraftAction(id, draftId, user.id, await readJson(req, MutationDraftActionSchema, 512 * 1024));
  return new Response(null, { status: 204 });
});
