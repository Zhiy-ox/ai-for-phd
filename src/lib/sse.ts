// Server-sent events over a streamed Response. Wire format per event:
//   event: <event.type>\n
//   data: <JSON.stringify(event)>\n\n
// The client reads via fetch + ReadableStream (POST bodies rule out
// EventSource) — see src/components/use-sse-stream.ts.

export function sseResponse<T extends { type: string }>(
  gen: AsyncGenerator<T>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abort = () => {
        void gen.return?.(undefined as never);
      };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        for await (const event of gen) {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ type: "error", code: "unknown", message })}\n\n`,
          ),
        );
      } finally {
        signal?.removeEventListener("abort", abort);
        controller.close();
      }
    },
    cancel() {
      void gen.return?.(undefined as never);
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
