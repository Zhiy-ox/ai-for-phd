// Usage-window memory: remembers when a provider last returned a
// usage_limit error so session setup can steer the user to the other
// backend instead of letting them burn a turn to find out.
import { getSettings, setSettings } from "@/lib/db/repos/settings";
import type { ProviderEvent, ProviderId } from "./types";

// Claude Pro-style windows reset within 5 hours; after that the memory
// expires on its own even if nothing cleared it.
const LIMIT_WINDOW_MS = 5 * 60 * 60 * 1000;

function keyOf(provider: ProviderId): "claude_limited_at" | "codex_limited_at" {
  return provider === "claude" ? "claude_limited_at" : "codex_limited_at";
}

export function recordUsageLimit(provider: ProviderId): void {
  try {
    setSettings({ [keyOf(provider)]: new Date().toISOString() });
  } catch {
    // This memory is advisory. A SQLite problem must not replace the
    // provider error that the caller needs to surface.
  }
}

/** A successful call proves the window is open again. */
export function clearUsageLimit(provider: ProviderId): void {
  try {
    if (getSettings()[keyOf(provider)]) setSettings({ [keyOf(provider)]: "" });
  } catch {
    // The provider result remains authoritative when advisory storage fails.
  }
}

/** ISO timestamp of a recent usage-limit hit, or null once stale/absent. */
export function usageLimitedAt(provider: ProviderId): string | null {
  try {
    const raw = getSettings()[keyOf(provider)];
    if (!raw) return null;
    const at = new Date(raw).getTime();
    if (Number.isNaN(at) || Date.now() - at > LIMIT_WINDOW_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Observe a streamed terminal event without ever replacing that event. */
export function trackStreamUsage<T extends ProviderEvent>(
  provider: ProviderId,
  event: T,
): T {
  if (event.type === "done") clearUsageLimit(provider);
  else if (event.type === "error" && event.code === "usage_limit") {
    recordUsageLimit(provider);
  }
  return event;
}
