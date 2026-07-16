// Usage-window memory: record on limit, clear on success, expire on its own —
// against a throwaway SQLite db in a temp DATA_DIR (set before the client
// module loads).
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "aiphd-usage-"));

const { recordUsageLimit, clearUsageLimit, usageLimitedAt } = await import(
  "@/lib/providers/usage"
);
const { getSettings, setSettings } = await import("@/lib/db/repos/settings");

describe("usage-window memory", () => {
  it("is empty by default", () => {
    expect(usageLimitedAt("claude")).toBeNull();
    expect(usageLimitedAt("codex")).toBeNull();
  });

  it("records a hit per provider and clears on success", () => {
    recordUsageLimit("claude");
    expect(usageLimitedAt("claude")).not.toBeNull();
    expect(usageLimitedAt("codex")).toBeNull();

    clearUsageLimit("claude");
    expect(usageLimitedAt("claude")).toBeNull();
    expect(getSettings().claude_limited_at).toBe("");
  });

  it("expires stale hits after the five-hour window", () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    setSettings({ codex_limited_at: sixHoursAgo });
    expect(usageLimitedAt("codex")).toBeNull();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    setSettings({ codex_limited_at: oneHourAgo });
    expect(usageLimitedAt("codex")).toBe(oneHourAgo);
  });

  it("treats garbage timestamps as no limit", () => {
    setSettings({ codex_limited_at: "not-a-date" });
    expect(usageLimitedAt("codex")).toBeNull();
  });
});
