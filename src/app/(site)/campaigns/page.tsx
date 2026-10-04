import type { Metadata } from "next";
import { CampaignList } from "@/components/campaigns/campaign-list";
import { listCampaigns } from "@/lib/server/campaigns";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Кампании" };

export default async function CampaignsPage() {
  const user = await requireUser("/campaigns");
  return <CampaignList initial={await listCampaigns(user.id)} />;
}
