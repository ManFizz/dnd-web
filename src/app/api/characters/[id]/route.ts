import { deleteCharacter, getCharacter, saveCharacter, SaveCharacterSchema } from "@/lib/server/characters";
import { handler, readJson, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/characters/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return Response.json(await getCharacter(id, user.id));
});

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/characters/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, SaveCharacterSchema);
  return Response.json(await saveCharacter(id, user.id, body));
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/characters/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await deleteCharacter(id, user.id);
  return new Response(null, { status: 204 });
});
