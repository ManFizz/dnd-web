import { z } from "zod";
import { handler, HttpError, readJson, requireApiUser } from "@/lib/server/http";
import { CustomSpellSchema, deleteSpell, getSpellsByIds, updateCustomSpell } from "@/lib/server/spells";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/spells/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const [spell] = await getSpellsByIds(user, [id]);
  if (!spell) throw new HttpError(404, "Заклинание не найдено");
  return Response.json({ spell });
});

export const PUT = handler(async (req: Request, ctx: RouteContext<"/api/spells/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const body = await readJson(req, z.object({ spell: CustomSpellSchema }));
  return Response.json({ spell: await updateCustomSpell(user, id, body.spell) });
});

export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/spells/[id]">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await deleteSpell(user, id);
  return new Response(null, { status: 204 });
});
