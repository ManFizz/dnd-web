import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { handler, HttpError, readJson, requireApiUser } from "@/lib/server/http";

const Body = z.object({ newPassword: z.string().min(8, "Нужно не меньше 8 символов").max(128) });

const MESSAGES: Record<string, string> = {
  PASSWORD_ALREADY_SET: "Пароль уже задан: смените его в форме выше",
  PASSWORD_TOO_SHORT: "Пароль слишком короткий: нужно не меньше 8 символов",
  PASSWORD_TOO_LONG: "Пароль слишком длинный",
};

/** Adds a password to an account created through Google or Discord. */
export const POST = handler(async (req: Request) => {
  await requireApiUser(req);
  const { newPassword } = await readJson(req, Body, 4096);
  try {
    await auth.api.setPassword({ body: { newPassword }, headers: req.headers });
  } catch (e) {
    if (isAPIError(e)) {
      const code = (e.body as { code?: string } | undefined)?.code ?? "";
      throw new HttpError(e.statusCode >= 500 ? 500 : 400, MESSAGES[code] ?? "Не удалось задать пароль");
    }
    throw e;
  }
  return Response.json({ ok: true });
});
