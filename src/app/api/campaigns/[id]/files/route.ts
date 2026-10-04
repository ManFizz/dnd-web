import { MAX_IMAGE_BYTES } from "@/lib/sessions";
import { handler, HttpError, requireApiUser } from "@/lib/server/http";
import { uploadFile } from "@/lib/server/sessions";

/** Raw image body; the file name goes in ?name=. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/files">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new HttpError(413, "Картинка больше 20 МБ");
  const data = new Uint8Array(await req.arrayBuffer());
  const name = new URL(req.url).searchParams.get("name") ?? "image";
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  return Response.json(await uploadFile(id, user.id, name, mime, data), { status: 201 });
});
