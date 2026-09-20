import { runEvents } from "@/lib/engine/events";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const sendEvent = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const onLog = (msg: string) => {
        sendEvent("log", msg);
      };

      const onStatus = (status: string) => {
        sendEvent("status", status);
        if (status === "COMPLETED" || status === "FAILED" || status === "STOPPED") {
          cleanup();
          closed = true;
          controller.close();
        }
      };

      runEvents.on(`log:${id}`, onLog);
      runEvents.on(`status:${id}`, onStatus);

      sendEvent("init", { connected: true, runId: id });

      const cleanup = () => {
        runEvents.off(`log:${id}`, onLog);
        runEvents.off(`status:${id}`, onStatus);
      };

      _req.signal.addEventListener("abort", () => {
        cleanup();
        closed = true;
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
