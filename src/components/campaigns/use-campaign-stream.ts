"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignEvent } from "@/lib/campaigns";

export type StreamState = "connecting" | "live" | "offline";

/**
 * Listens to the campaign's live events. The browser reconnects by itself;
 * after a reconnect `onEvent` gets a synthetic "resync" so the page reloads
 * whatever it may have missed while offline.
 */
export function useCampaignStream(campaignId: string | null, onEvent: (event: CampaignEvent | { type: "resync" }) => void): StreamState {
  const [state, setState] = useState<StreamState>("connecting");
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!campaignId) return;
    let opened = false;
    const source = new EventSource(`/api/campaigns/${campaignId}/stream`);
    source.addEventListener("ready", () => {
      setState("live");
      if (opened) handler.current({ type: "resync" });
      opened = true;
    });
    source.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as CampaignEvent);
      } catch {
        // Ignore malformed messages.
      }
    };
    source.onerror = () => setState(source.readyState === EventSource.CLOSED ? "offline" : "connecting");
    return () => source.close();
  }, [campaignId]);

  return state;
}
