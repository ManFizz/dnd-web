import type { CampaignEvent } from "@/lib/campaigns";
import { requireMember } from "@/lib/server/campaigns";
import { handler, requireApiUser } from "@/lib/server/http";
import { subscribe } from "@/lib/server/realtime";

// Server-Sent Events: the browser keeps this request open and receives a line per
// campaign change. Messages carry ids only; the client re-reads what it needs
// through the normal API, where access rules are checked.

const PING_MS = 15_000;

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/stream">) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await requireMember(id, user.id, { allowPending: true });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = await subscribe(id, (event: CampaignEvent) => send(`data: ${JSON.stringify(event)}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), PING_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      req.signal.addEventListener("abort", cleanup);
      // Reconnect delay for the browser, then a first message so the client knows it is live.
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx not to buffer this response.
      "X-Accel-Buffering": "no",
    },
  });
});
