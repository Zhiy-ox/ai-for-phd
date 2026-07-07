// Client-side reader for the POST-body SSE stream emitted by
// src/lib/sse.ts (event: <type>\ndata: <JSON>\n\n). EventSource cannot POST,
// so we read the fetch body stream by hand.
import type { SessionEvent } from "@/lib/viva/types";

function parseBlock(block: string): SessionEvent | null {
  const dataLines = block
    .split("\n")
    .filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return null;
  const raw = dataLines.map((line) => line.slice(5).trimStart()).join("\n");
  try {
    const parsed = JSON.parse(raw) as SessionEvent;
    if (parsed && typeof parsed === "object" && "type" in parsed) return parsed;
  } catch {
    // Malformed frame — skip it rather than kill the stream.
  }
  return null;
}

// POSTs `body` to `url` and invokes `onEvent` for every SessionEvent on the
// stream. Network/HTTP failures are surfaced as synthetic error events so the
// caller has a single rendering path. Resolves when the stream closes.
export async function streamSessionEvents(
  url: string,
  body: unknown,
  onEvent: (event: SessionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    onEvent({
      type: "error",
      code: "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok && !contentType.includes("text/event-stream")) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string" && data.error) message = data.error;
    } catch {
      // keep the generic message
    }
    onEvent({ type: "error", code: "unknown", message });
    return;
  }

  if (!res.body) {
    onEvent({ type: "error", code: "unknown", message: "Empty response stream." });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseBlock(block);
        if (event) onEvent(event);
      }
    }
    buffer += decoder.decode();
    const rest = buffer.trim();
    if (rest) {
      const event = parseBlock(rest);
      if (event) onEvent(event);
    }
  } catch (err) {
    if (signal?.aborted) return;
    onEvent({
      type: "error",
      code: "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
