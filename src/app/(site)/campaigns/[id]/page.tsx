import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignApp } from "@/components/campaigns/campaign-app";
import { getCampaign } from "@/lib/server/campaigns";
import { HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Кампания" };

export default async function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/campaigns/${id}`);
  const detail = await getCampaign(id, user.id).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  return <CampaignApp key={detail.id} initial={detail} />;
}
