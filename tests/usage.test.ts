// Usage-window memory: record on limit, clear on success, expire on its own —
// against a throwaway SQLite db in a temp DATA_DIR (set before the client
// module loads).
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  ProviderCallError,
  type AuthStatus,
  type CompleteOnceRequest,
  type LLMProvider,
  type ProviderEvent,
} from "@/lib/providers/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "aiphd-usage-"));

const { recordUsageLimit, clearUsageLimit, trackStreamUsage, usageLimitedAt } =
  await import("@/lib/providers/usage");
const { completeJsonWithUsageTracking } = await import(
  "@/lib/providers/usage-completion"
);
const { getDb } = await import("@/lib/db/client");
const { getSettings, setSettings } = await import("@/lib/db/repos/settings");

type StubProvider = LLMProvider & { calls: CompleteOnceRequest[] };

function stubProvider(responses: (string | Error)[]): StubProvider {
  const calls: CompleteOnceRequest[] = [];
  let index = 0;
  return {
    id: "claude",
    label: "Stub",
    calls,
    async *streamTurn(): AsyncGenerator<ProviderEvent> {
      throw new Error("streamTurn is not used in these tests");
    },
    async completeOnce(req: CompleteOnceRequest): Promise<string> {
      calls.push(req);
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (response instanceof Error) throw response;
      return response;
    },
    async checkAuth(): Promise<AuthStatus> {
      return { ok: true, detail: "stub" };
    },
  };
}

const AnswerSchema = z.object({ answer: z.string() });
const validAnswer = '```json\n{"answer":"yes"}\n```';

beforeEach(() => {
  setSettings({ claude_limited_at: "", codex_limited_at: "" });
});

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

describe("one-shot quota tracking", () => {
  it("clears a stale marker after a successful structured completion", async () => {
    recordUsageLimit("claude");
    const provider = stubProvider(["not json", validAnswer]);

    const result = await completeJsonWithUsageTracking(
      provider,
      { systemPrompt: "system", userMessage: "answer" },
      AnswerSchema,
    );

    expect(result).toMatchObject({ ok: true, value: { answer: "yes" } });
    expect(provider.calls).toHaveLength(2);
    expect(usageLimitedAt("claude")).toBeNull();
  });

  it("clears after a returned response even when its JSON is invalid", async () => {
    recordUsageLimit("claude");
    const retryError = new ProviderCallError("unknown", "retry disconnected");
    const provider = stubProvider(["not json", retryError]);

    await expect(
      completeJsonWithUsageTracking(
        provider,
        { systemPrompt: "system", userMessage: "answer" },
        AnswerSchema,
      ),
    ).rejects.toBe(retryError);
    expect(usageLimitedAt("claude")).toBeNull();
  });

  it("records a usage limit raised by the JSON correction retry", async () => {
    const quotaError = new ProviderCallError("usage_limit", "window exhausted");
    const provider = stubProvider(["not json", quotaError]);

    await expect(
      completeJsonWithUsageTracking(
        provider,
        { systemPrompt: "system", userMessage: "answer" },
        AnswerSchema,
      ),
    ).rejects.toBe(quotaError);
    expect(provider.calls).toHaveLength(2);
    expect(usageLimitedAt("claude")).not.toBeNull();
  });

  it("preserves provider results, errors, and stream events when SQLite is unavailable", async () => {
    const db = getDb();
    db.close();
    try {
      const provider = stubProvider([validAnswer]);
      const result = await completeJsonWithUsageTracking(
        provider,
        { systemPrompt: "system", userMessage: "answer" },
        AnswerSchema,
      );
      expect(result).toMatchObject({ ok: true, value: { answer: "yes" } });

      const done = { type: "done", fullText: "panel answer" } as const;
      const limitEvent = {
        type: "error",
        code: "usage_limit",
        message: "window exhausted",
      } as const;
      expect(trackStreamUsage("claude", done)).toBe(done);
      expect(trackStreamUsage("claude", limitEvent)).toBe(limitEvent);

      const quotaError = new ProviderCallError("usage_limit", "window exhausted");
      await expect(
        completeJsonWithUsageTracking(
          stubProvider([quotaError]),
          { systemPrompt: "system", userMessage: "answer" },
          AnswerSchema,
        ),
      ).rejects.toBe(quotaError);
    } finally {
      globalThis.__aiPhdDb = undefined;
    }
  });
});
