import { CreatureQuerySchema, searchCreatures } from "@/lib/server/bestiary";
import { handler, HttpError, requireApiUser } from "@/lib/server/http";

export const GET = handler(async (req: Request) => {
  const user = await requireApiUser(req);
  const parsed = CreatureQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new HttpError(400, "Неверный запрос");
  return Response.json(await searchCreatures(user.id, parsed.data));
});
