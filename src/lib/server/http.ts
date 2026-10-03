import "server-only";
import { z } from "zod";
import { userFromRequest, type SessionUser } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function readJson<T extends z.ZodType>(req: Request, schema: T, maxBytes = MAX_BODY_BYTES): Promise<z.infer<T>> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new HttpError(413, "Слишком большой запрос");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Слишком большой запрос");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Данные не прошли проверку", z.treeifyError(parsed.error));
  return parsed.data;
}

export async function requireApiUser(req: Request): Promise<SessionUser> {
  const user = await userFromRequest(req);
  if (!user) throw new HttpError(401, "Нужно войти");
  return user;
}

/** Wrap a route handler: converts HttpError into JSON responses. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message, details: e.details }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
    }
  };
}
