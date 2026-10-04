"use client";

import { createContext, use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CampaignDetail, CampaignScope } from "@/lib/campaigns";
import { api } from "./api";

// Shared state of the campaign page: the detail, the viewer's role and a
// counter per data scope that grows on every live event of that scope, so a
// tab can reload exactly when its data changed.

export type CampaignCtx = {
  id: string;
  detail: CampaignDetail;
  gm: boolean;
  owner: boolean;
  scopes: Partial<Record<CampaignScope, number>>;
  refresh: () => Promise<void>;
};

export const CampaignContext = createContext<CampaignCtx | null>(null);

export function useCampaign(): CampaignCtx {
  const ctx = use(CampaignContext);
  if (!ctx) throw new Error("useCampaign outside of CampaignContext");
  return ctx;
}

/** Loads `url` now and again whenever the scope changes. */
export function useScopeData<T>(scope: CampaignScope, url: string | null): [T | null, () => void] {
  const { scopes } = useCampaign();
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  const tick = scopes[scope] ?? 0;
  useEffect(() => {
    if (!url) return;
    let alive = true;
    api<T>(url)
      .then((r) => alive && setData(r))
      .catch((e) => {
        if (alive) toast.error(e instanceof Error ? e.message : "Не удалось загрузить");
      });
    return () => {
      alive = false;
    };
  }, [url, tick, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return [data, reload];
}

/** Runs an API call with a toast on error; returns whether it succeeded. */
export async function run(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn();
    if (success) toast.success(success);
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Ошибка");
    return false;
  }
}
