"use client";

import { ArrowLeft, Expand, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { api } from "./api";
import { MapView } from "./map-view";
import { mapImageUrl, type MapsData } from "./maps";
import { useCampaignStream } from "./use-campaign-stream";

// The shared screen (a TV or a projector at the table): the map the GM shows,
// exactly as players see it, whoever is logged in on that device.

export function PresentScreen({ campaignId, name }: { campaignId: string; name: string }) {
  const [data, setData] = useState<MapsData | null>(null);
  const load = useCallback(() => {
    api<MapsData>(`/api/campaigns/${campaignId}/maps?view=player`)
      .then(setData)
      .catch(() => {
        // The stream reconnects and triggers another load.
      });
  }, [campaignId]);

  useEffect(load, [load]);
  useCampaignStream(campaignId, (e) => {
    if (e.type === "resync" || (e.type === "scope" && e.scope === "maps")) load();
  });

  const map = data?.maps.find((m) => m.id === data.presentMapId) ?? null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0f] text-white">
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        <Link href={`/campaigns/${campaignId}`} className="inline-flex items-center gap-1 text-white/60 hover:text-white">
          <ArrowLeft className="size-4" /> {name}
        </Link>
        <span className="flex-1 truncate text-center font-display text-lg font-bold">{map?.name ?? ""}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Во весь экран"
          onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          <Expand />
        </Button>
      </div>
      {map ? (
        <MapView map={map} imageUrl={mapImageUrl(campaignId, map, true)} gm={false} className="mx-2 mb-2 flex-1 rounded-lg border-white/10" />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Empty icon={<MapIcon />} title="Экран ждёт карту" className="text-white/70">
            Когда ГМ нажмёт «Показать всем», карта появится здесь.
          </Empty>
        </div>
      )}
    </div>
  );
}
