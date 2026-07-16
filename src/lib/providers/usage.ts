// Usage-window memory: remembers when a provider last returned a
// usage_limit error so session setup can steer the user to the other
// backend instead of letting them burn a turn to find out.
import { getSettings, setSettings } from "@/lib/db/repos/settings";
import type { ProviderId } from "./types";

// Claude Pro-style windows reset within 5 hours; after that the memory
// expires on its own even if nothing cleared it.
const LIMIT_WINDOW_MS = 5 * 60 * 60 * 1000;

function keyOf(provider: ProviderId): "claude_limited_at" | "codex_limited_at" {
  return provider === "claude" ? "claude_limited_at" : "codex_limited_at";
}

export function recordUsageLimit(provider: ProviderId): void {
  setSettings({ [keyOf(provider)]: new Date().toISOString() });
}

/** A successful call proves the window is open again. */
export function clearUsageLimit(provider: ProviderId): void {
  if (getSettings()[keyOf(provider)]) setSettings({ [keyOf(provider)]: "" });
}

/** ISO timestamp of a recent usage-limit hit, or null once stale/absent. */
export function usageLimitedAt(provider: ProviderId): string | null {
  const raw = getSettings()[keyOf(provider)];
  if (!raw) return null;
  const at = new Date(raw).getTime();
  if (Number.isNaN(at) || Date.now() - at > LIMIT_WINDOW_MS) return null;
  return raw;
}
