import { z } from "zod";
import { LibraryFileSchema, TemplateInputSchema } from "@/lib/grants";
import { createTemplate, importTemplates, listTemplates } from "@/lib/server/grants";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/library">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json({ templates: await listTemplates(id, user.id) });
});

const PostSchema = z.union([LibraryFileSchema, TemplateInputSchema]);

/** One new template, or a library file to import. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/library">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, PostSchema, 8 * 1024 * 1024);
  if ("format" in body) return Response.json(await importTemplates(id, user.id, body.templates));
  return Response.json(await createTemplate(id, user.id, body), { status: 201 });
});
