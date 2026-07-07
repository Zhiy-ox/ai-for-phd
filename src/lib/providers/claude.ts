// Claude adapter backed by @anthropic-ai/claude-agent-sdk, which spawns the
// locally installed Claude Code CLI (subscription auth, not API key).

import {
  query,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync } from "node:fs";
import { scratchDir } from "@/lib/db/client";
import { checkClaudeAuth } from "./auth-status";
import {
  ProviderCallError,
  type ChatMessage,
  type CompleteOnceRequest,
  type LLMProvider,
  type ProviderErrorCode,
  type ProviderEvent,
  type TurnRequest,
} from "./types";

// Maps raw failure text from either CLI to our stable error codes. Shared
// with the Codex adapter.
export function inferErrorCode(message: string): ProviderErrorCode {
  if (/ENOENT/.test(message)) return "spawn_failed";
  if (/login|logged in|authenticat|OAuth|API key/i.test(message)) return "not_logged_in";
  if (/usage limit|rate limit|out of.*credit/i.test(message)) return "usage_limit";
  if (/No conversation found|session.*not.*found|resume/i.test(message)) return "session_expired";
  return "unknown";
}

export function errorEventFromUnknown(
  err: unknown,
): Extract<ProviderEvent, { type: "error" }> {
  const message = err instanceof Error ? err.message : String(err);
  const errno = (err as NodeJS.ErrnoException)?.code;
  const code = errno === "ENOENT" ? "spawn_failed" : inferErrorCode(message);
  return { type: "error", code, message };
}

// Pure mapping from an SDK stdout message to our provider event. Returns null
// for messages the app does not care about (tool progress, status, etc.).
export function mapClaudeMessage(msg: SDKMessage): ProviderEvent | null {
  if (msg.type === "system" && msg.subtype === "init") {
    return { type: "session", sessionRef: msg.session_id };
  }
  if (msg.type === "stream_event") {
    const event = msg.event;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      return { type: "delta", text: event.delta.text };
    }
    return null;
  }
  if (msg.type === "result") {
    if (msg.subtype === "success") {
      if (!msg.is_error) {
        return { type: "done", fullText: msg.result };
      }
      return { type: "error", code: inferErrorCode(msg.result), message: msg.result };
    }
    const message = msg.errors.length > 0 ? msg.errors.join("; ") : msg.subtype;
    return { type: "error", code: inferErrorCode(message), message };
  }
  return null;
}

// Renders a stored transcript for the replay fallback. The candidate is the
// human user; the panel is the assistant.
export function renderTranscript(transcript: ChatMessage[]): string {
  return transcript
    .map((m) => `${m.role === "user" ? "CANDIDATE" : "PANEL"}: ${m.content}`)
    .join("\n");
}

export function buildReplaySystemPrompt(
  systemPrompt: string,
  transcript: ChatMessage[],
): string {
  return `${systemPrompt}\n\n## Conversation so far (recovered)\n${renderTranscript(transcript)}`;
}

function sanitizedEnv(): Record<string, string | undefined> {
  // Delete ANTHROPIC_API_KEY so the CLI uses the user's subscription login.
  // HOME/PATH and everything else are kept via the spread.
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function buildOptions(cfg: {
  systemPrompt: string;
  resume?: string;
  model?: string;
  includePartialMessages: boolean;
  signal?: AbortSignal;
}): Options {
  // The scratch dir normally exists once the db client has opened, but the
  // adapters must not depend on that ordering.
  mkdirSync(scratchDir, { recursive: true });
  const options: Options = {
    systemPrompt: cfg.systemPrompt,
    allowedTools: [],
    settingSources: [],
    maxTurns: 1,
    includePartialMessages: cfg.includePartialMessages,
    pathToClaudeCodeExecutable: process.env.CLAUDE_BIN ?? "claude",
    cwd: scratchDir,
    env: sanitizedEnv(),
  };
  if (cfg.resume !== undefined) options.resume = cfg.resume;
  if (cfg.model !== undefined) options.model = cfg.model;
  if (cfg.signal) {
    const controller = new AbortController();
    if (cfg.signal.aborted) controller.abort();
    else cfg.signal.addEventListener("abort", () => controller.abort(), { once: true });
    options.abortController = controller;
  }
  return options;
}

// One query() attempt. Never throws: every failure becomes an error event,
// and the generator always ends with exactly one terminal done/error event.
async function* attemptStream(
  req: TurnRequest,
  cfg: { systemPrompt: string; resume?: string },
  signal?: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  try {
    const q = query({
      prompt: req.userMessage,
      options: buildOptions({
        systemPrompt: cfg.systemPrompt,
        resume: cfg.resume,
        model: req.model,
        includePartialMessages: true,
        signal,
      }),
    });
    for await (const msg of q) {
      const ev = mapClaudeMessage(msg as SDKMessage);
      if (!ev) continue;
      yield ev;
      if (ev.type === "done" || ev.type === "error") return;
    }
    yield {
      type: "error",
      code: "unknown",
      message: "Claude stream ended without a result",
    };
  } catch (err) {
    yield errorEventFromUnknown(err);
  }
}

export const claudeProvider: LLMProvider = {
  id: "claude",
  label: "Claude (Claude Code)",

  async *streamTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
    const canReplay = Boolean(
      req.sessionRef && req.transcript && req.transcript.length > 0,
    );
    for await (const ev of attemptStream(
      req,
      { systemPrompt: req.systemPrompt, resume: req.sessionRef },
      signal,
    )) {
      if (ev.type === "error" && ev.code === "session_expired" && canReplay) {
        // The provider session is gone; retry once with a fresh session whose
        // system prompt embeds the stored transcript. The fresh attempt emits
        // its own `session` event so the caller can persist the new ref.
        yield* attemptStream(
          req,
          {
            systemPrompt: buildReplaySystemPrompt(req.systemPrompt, req.transcript!),
            resume: undefined,
          },
          signal,
        );
        return;
      }
      yield ev;
      if (ev.type === "done" || ev.type === "error") return;
    }
  },

  async completeOnce(req: CompleteOnceRequest, signal?: AbortSignal): Promise<string> {
    try {
      const q = query({
        prompt: req.userMessage,
        options: buildOptions({
          systemPrompt: req.systemPrompt,
          model: req.model,
          includePartialMessages: false,
          signal,
        }),
      });
      for await (const msg of q) {
        const ev = mapClaudeMessage(msg as SDKMessage);
        if (ev?.type === "done") return ev.fullText;
        if (ev?.type === "error") throw new ProviderCallError(ev.code, ev.message);
      }
      throw new ProviderCallError("unknown", "Claude produced no result");
    } catch (err) {
      if (err instanceof ProviderCallError) throw err;
      const ev = errorEventFromUnknown(err);
      throw new ProviderCallError(ev.code, ev.message);
    }
  },

  checkAuth: checkClaudeAuth,
};
