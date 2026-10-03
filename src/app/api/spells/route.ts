import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, readJson, requireApiUser } from "@/lib/server/http";
import { createCustomSpell, CustomSpellSchema, getSpellsByIds, libraryStats, searchSpells, SpellQuerySchema } from "@/lib/server/spells";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireApiUser(req);
  const sp = req.nextUrl.searchParams;
  const ids = sp.get("ids");
  if (ids !== null) {
    return Response.json({ spells: await getSpellsByIds(user, ids.split(",").filter(Boolean)) });
  }
  if (sp.get("stats") !== null) return Response.json({ stats: await libraryStats() });
  const query = SpellQuerySchema.parse(Object.fromEntries(sp.entries()));
  return Response.json(await searchSpells(user, query));
});

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  const body = await readJson(req, z.object({ spell: CustomSpellSchema }));
  return Response.json({ spell: await createCustomSpell(user, body.spell) }, { status: 201 });
});
