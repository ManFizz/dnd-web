import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PresentScreen } from "@/components/campaigns/present";
import { getCampaign } from "@/lib/server/campaigns";
import { HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Общий экран" };

export default async function PresentPage(props: PageProps<"/campaigns/[id]/present">) {
  const { id } = await props.params;
  const user = await requireUser(`/campaigns/${id}/present`);
  const detail = await getCampaign(id, user.id).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  if (detail.me.status !== "active") notFound();
  return <PresentScreen campaignId={detail.id} name={detail.name} />;
}
