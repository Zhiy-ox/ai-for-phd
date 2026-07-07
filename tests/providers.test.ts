// Unit tests for the pure event-mapping logic of both provider adapters.
// Fixtures are hand-written objects mimicking the SDK .d.ts shapes; no CLI
// subprocess is ever spawned here.
import { describe, expect, it } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ThreadEvent } from "@openai/codex-sdk";
import {
  buildReplaySystemPrompt,
  errorEventFromUnknown,
  inferErrorCode,
  mapClaudeMessage,
  renderTranscript,
} from "@/lib/providers/claude";
import { CodexEventMapper, composeFirstTurnPrompt } from "@/lib/providers/codex";

// Fixtures only carry the fields the mapper reads; cast through unknown to
// avoid restating the SDK's dozens of bookkeeping fields.
const claudeMsg = (msg: unknown): SDKMessage => msg as SDKMessage;

const codexUsage = {
  input_tokens: 10,
  cached_input_tokens: 0,
  output_tokens: 5,
  reasoning_output_tokens: 0,
};

describe("inferErrorCode", () => {
  it("maps login/auth failures to not_logged_in", () => {
    expect(inferErrorCode("Please run /login to continue")).toBe("not_logged_in");
    expect(inferErrorCode("You are not logged in")).toBe("not_logged_in");
    expect(inferErrorCode("Authentication failed")).toBe("not_logged_in");
    expect(inferErrorCode("OAuth token has been revoked")).toBe("not_logged_in");
    expect(inferErrorCode("Invalid API key provided")).toBe("not_logged_in");
  });

  it("maps quota failures to usage_limit", () => {
    expect(inferErrorCode("Usage limit reached, try again later")).toBe("usage_limit");
    expect(inferErrorCode("Rate limit exceeded")).toBe("usage_limit");
    expect(inferErrorCode("You are out of Anthropic credits")).toBe("usage_limit");
  });

  it("maps missing-session failures to session_expired", () => {
    expect(inferErrorCode("No conversation found with session ID abc")).toBe(
      "session_expired",
    );
    expect(inferErrorCode("Session xyz was not found")).toBe("session_expired");
    expect(inferErrorCode("Failed to resume thread")).toBe("session_expired");
  });

  it("maps ENOENT to spawn_failed", () => {
    expect(inferErrorCode("spawn /usr/local/bin/claude ENOENT")).toBe("spawn_failed");
  });

  it("falls back to unknown", () => {
    expect(inferErrorCode("Something inexplicable happened")).toBe("unknown");
  });
});

describe("errorEventFromUnknown", () => {
  it("uses the errno code for spawn failures", () => {
    const err = Object.assign(new Error("spawn codex failed"), { code: "ENOENT" });
    expect(errorEventFromUnknown(err)).toEqual({
      type: "error",
      code: "spawn_failed",
      message: "spawn codex failed",
    });
  });

  it("infers the code from the message of plain errors", () => {
    expect(errorEventFromUnknown(new Error("usage limit reached"))).toEqual({
      type: "error",
      code: "usage_limit",
      message: "usage limit reached",
    });
  });

  it("stringifies non-Error throwables", () => {
    expect(errorEventFromUnknown("boom")).toEqual({
      type: "error",
      code: "unknown",
      message: "boom",
    });
  });
});

describe("mapClaudeMessage", () => {
  it("maps system init to a session event", () => {
    const msg = claudeMsg({
      type: "system",
      subtype: "init",
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(msg)).toEqual({ type: "session", sessionRef: "sess-123" });
  });

  it("ignores other system messages", () => {
    const msg = claudeMsg({ type: "system", subtype: "status", status: null });
    expect(mapClaudeMessage(msg)).toBeNull();
  });

  it("maps text_delta stream events to deltas", () => {
    const msg = claudeMsg({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hel" },
      },
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(msg)).toEqual({ type: "delta", text: "Hel" });
  });

  it("ignores non-text stream events", () => {
    const thinking = claudeMsg({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "hmm" },
      },
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(thinking)).toBeNull();
    const start = claudeMsg({
      type: "stream_event",
      event: { type: "message_start" },
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(start)).toBeNull();
  });

  it("ignores full assistant messages", () => {
    const msg = claudeMsg({ type: "assistant", message: { content: [] } });
    expect(mapClaudeMessage(msg)).toBeNull();
  });

  it("maps a successful result to done", () => {
    const msg = claudeMsg({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Final answer.",
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(msg)).toEqual({ type: "done", fullText: "Final answer." });
  });

  it("maps an is_error success result to an error with an inferred code", () => {
    const msg = claudeMsg({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Please run /login to authenticate",
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(msg)).toEqual({
      type: "error",
      code: "not_logged_in",
      message: "Please run /login to authenticate",
    });
  });

  it("maps error results to errors, joining the errors array", () => {
    const msg = claudeMsg({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["No conversation found with session ID abc"],
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(msg)).toEqual({
      type: "error",
      code: "session_expired",
      message: "No conversation found with session ID abc",
    });
  });

  it("falls back to the subtype when an error result carries no messages", () => {
    const msg = claudeMsg({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      errors: [],
      session_id: "sess-123",
    });
    expect(mapClaudeMessage(msg)).toEqual({
      type: "error",
      code: "unknown",
      message: "error_max_turns",
    });
  });
});

describe("transcript replay helpers", () => {
  it("renders user as CANDIDATE and assistant as PANEL", () => {
    const rendered = renderTranscript([
      { role: "assistant", content: "Why did you choose this method?" },
      { role: "user", content: "It scales better." },
    ]);
    expect(rendered).toBe(
      "PANEL: Why did you choose this method?\nCANDIDATE: It scales better.",
    );
  });

  it("embeds the transcript under a recovered-conversation heading", () => {
    const prompt = buildReplaySystemPrompt("Base prompt.", [
      { role: "user", content: "hi" },
    ]);
    expect(prompt).toBe(
      "Base prompt.\n\n## Conversation so far (recovered)\nCANDIDATE: hi",
    );
  });
});

describe("composeFirstTurnPrompt", () => {
  it("prefixes standing instructions and separates system from user text", () => {
    const prompt = composeFirstTurnPrompt("You are a viva panel.", "Begin the viva.");
    expect(prompt.startsWith("SYSTEM INSTRUCTIONS — ")).toBe(true);
    expect(prompt).toContain("never use tools, never read or edit files.\n\n");
    expect(prompt).toContain("You are a viva panel.\n\n---\n\nBegin the viva.");
    expect(prompt.endsWith("Begin the viva.")).toBe(true);
  });
});

describe("CodexEventMapper", () => {
  it("maps a full happy-path turn: session, suffix deltas, done", () => {
    const mapper = new CodexEventMapper();
    const events: ThreadEvent[] = [
      { type: "thread.started", thread_id: "thread-1" },
      { type: "turn.started" },
      { type: "item.started", item: { id: "m1", type: "agent_message", text: "" } },
      { type: "item.updated", item: { id: "m1", type: "agent_message", text: "Hel" } },
      { type: "item.updated", item: { id: "m1", type: "agent_message", text: "Hello" } },
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "Hello!" } },
      { type: "turn.completed", usage: codexUsage },
    ];
    expect(events.map((e) => mapper.map(e))).toEqual([
      { type: "session", sessionRef: "thread-1" },
      null,
      null,
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      { type: "delta", text: "!" },
      { type: "done", fullText: "Hello!" },
    ]);
  });

  it("emits nothing for unchanged item updates", () => {
    const mapper = new CodexEventMapper();
    mapper.map({
      type: "item.updated",
      item: { id: "m1", type: "agent_message", text: "Same" },
    });
    expect(
      mapper.map({
        type: "item.updated",
        item: { id: "m1", type: "agent_message", text: "Same" },
      }),
    ).toBeNull();
  });

  it("ignores non-agent_message items", () => {
    const mapper = new CodexEventMapper();
    expect(
      mapper.map({
        type: "item.updated",
        item: { id: "r1", type: "reasoning", text: "thinking..." },
      }),
    ).toBeNull();
    expect(
      mapper.map({
        type: "item.completed",
        item: {
          id: "c1",
          type: "command_execution",
          command: "ls",
          aggregated_output: "",
          status: "completed",
        },
      }),
    ).toBeNull();
  });

  it("reconciles divergent completed text into fullText without a delta", () => {
    const mapper = new CodexEventMapper();
    mapper.map({
      type: "item.updated",
      item: { id: "m1", type: "agent_message", text: "Hello draft" },
    });
    expect(
      mapper.map({
        type: "item.completed",
        item: { id: "m1", type: "agent_message", text: "Hello final" },
      }),
    ).toBeNull();
    expect(mapper.map({ type: "turn.completed", usage: codexUsage })).toEqual({
      type: "done",
      fullText: "Hello final",
    });
  });

  it("joins multiple agent messages in arrival order", () => {
    const mapper = new CodexEventMapper();
    mapper.map({
      type: "item.completed",
      item: { id: "m1", type: "agent_message", text: "First." },
    });
    mapper.map({
      type: "item.completed",
      item: { id: "m2", type: "agent_message", text: "Second." },
    });
    expect(mapper.map({ type: "turn.completed", usage: codexUsage })).toEqual({
      type: "done",
      fullText: "First.\n\nSecond.",
    });
  });

  it("maps turn.failed with error-code inference", () => {
    const mapper = new CodexEventMapper();
    expect(
      mapper.map({
        type: "turn.failed",
        error: { message: "usage limit reached for your plan" },
      }),
    ).toEqual({
      type: "error",
      code: "usage_limit",
      message: "usage limit reached for your plan",
    });
  });

  it("maps stream error events with error-code inference", () => {
    const mapper = new CodexEventMapper();
    expect(
      mapper.map({ type: "error", message: "session abc123 was not found" }),
    ).toEqual({
      type: "error",
      code: "session_expired",
      message: "session abc123 was not found",
    });
    expect(mapper.map({ type: "error", message: "stream disconnected" })).toEqual({
      type: "error",
      code: "unknown",
      message: "stream disconnected",
    });
  });
});
