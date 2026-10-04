import { z } from "zod";
import { TemplateInputSchema } from "@/lib/grants";
import { deleteTemplate, syncTemplate, updateTemplate } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/library/[templateId]">) => {
  const user = await requireApiUser(req);
  const { id, templateId } = await ctx.params;
  await updateTemplate(id, templateId, user.id, await readJson(req, TemplateInputSchema, 1024 * 1024));
  return new Response(null, { status: 204 });
});

/** Pushes the template to every sheet that holds a copy of it. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/library/[templateId]">) => {
  const user = await requireApiUser(req);
  const { id, templateId } = await ctx.params;
  await readJson(req, z.object({ action: z.literal("sync") }), 1024);
  return Response.json(await syncTemplate(id, templateId, user.id));
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/library/[templateId]">) => {
  const user = await requireApiUser(req);
  const { id, templateId } = await ctx.params;
  await deleteTemplate(id, templateId, user.id);
  return new Response(null, { status: 204 });
});
