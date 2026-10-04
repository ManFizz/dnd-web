import type { Metadata } from "next";
import { JoinCard } from "@/components/campaigns/join-card";
import { previewInvite } from "@/lib/server/campaigns";
import { HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Приглашение в кампанию" };

export default async function JoinPage(props: PageProps<"/join/[code]">) {
  const { code } = await props.params;
  const user = await requireUser(`/join/${code}`);
  const preview = await previewInvite(code, user.id).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  });
  return <JoinCard preview={preview} />;
}
