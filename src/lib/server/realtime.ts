import "server-only";
import { Client } from "pg";
import type { CampaignEvent } from "@/lib/campaigns";
import { prisma } from "./db";

// Campaign events travel through Postgres LISTEN/NOTIFY, so every app process
// (one container today, more later) sees changes made by any other one.
// Each process keeps a single listening connection and fans events out to the
// open SSE streams of that campaign.

const CHANNEL = "campaign_events";

type Listener = (event: CampaignEvent) => void;

type Hub = {
  listeners: Map<string, Set<Listener>>;
  client: Client | null;
  connecting: Promise<void> | null;
  retry: ReturnType<typeof setTimeout> | null;
};

const globalForHub = globalThis as unknown as { campaignHub?: Hub };
const hub: Hub = (globalForHub.campaignHub ??= { listeners: new Map(), client: null, connecting: null, retry: null });

function dispatch(raw: string | undefined) {
  if (!raw) return;
  let event: CampaignEvent;
  try {
    event = JSON.parse(raw) as CampaignEvent;
  } catch {
    return;
  }
  const set = hub.listeners.get(event.campaignId);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(event);
    } catch (e) {
      console.error("campaign listener failed", e);
    }
  }
}

function hasListeners(): boolean {
  for (const set of hub.listeners.values()) if (set.size) return true;
  return false;
}

function dropClient() {
  const client = hub.client;
  hub.client = null;
  if (client) client.end().catch(() => {});
  if (hasListeners() && !hub.retry) {
    hub.retry = setTimeout(() => {
      hub.retry = null;
      void ensureClient();
    }, 2000);
  }
}

async function ensureClient(): Promise<void> {
  if (hub.client) return;
  if (hub.connecting) return hub.connecting;
  hub.connecting = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const client = new Client({ connectionString });
    client.on("notification", (msg) => {
      if (msg.channel === CHANNEL) dispatch(msg.payload);
    });
    client.on("error", (e) => {
      console.error("campaign listener connection error", e);
      if (hub.client === client) dropClient();
    });
    client.on("end", () => {
      if (hub.client === client) dropClient();
    });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    hub.client = client;
  })()
    .catch((e) => {
      console.error("campaign listener failed to connect", e);
      dropClient();
    })
    .finally(() => {
      hub.connecting = null;
    });
  return hub.connecting;
}

/** Subscribe to events of one campaign. Returns the unsubscribe function. */
export async function subscribe(campaignId: string, fn: Listener): Promise<() => void> {
  let set = hub.listeners.get(campaignId);
  if (!set) hub.listeners.set(campaignId, (set = new Set()));
  set.add(fn);
  await ensureClient();
  return () => {
    const cur = hub.listeners.get(campaignId);
    if (!cur) return;
    cur.delete(fn);
    if (!cur.size) hub.listeners.delete(campaignId);
  };
}

/** Announce a change. Never throws: a lost notification only delays a refresh. */
export async function publish(event: CampaignEvent): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`;
  } catch (e) {
    console.error("campaign publish failed", e);
  }
}
