// Codex adapter backed by @openai/codex-sdk, which spawns the locally
// installed Codex CLI (ChatGPT subscription auth).

import {
  Codex,
  type CodexOptions,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
} from "@openai/codex-sdk";
import { mkdirSync } from "node:fs";
import { scratchDir } from "@/lib/db/client";
import { checkCodexAuth } from "./auth-status";
import {
  buildReplaySystemPrompt,
  errorEventFromUnknown,
  inferErrorCode,
} from "./claude";
import {
  ProviderCallError,
  type CompleteOnceRequest,
  type LLMProvider,
  type ProviderEvent,
  type TurnRequest,
} from "./types";

// Codex has no system-prompt channel, so the first turn of a thread carries
// the standing instructions inline. Continuation turns rely on the thread's
// own memory and send only the user message.
export function composeFirstTurnPrompt(systemPrompt: string, userMessage: string): string {
  return (
    "SYSTEM INSTRUCTIONS — these are your standing instructions for this " +
    "entire conversation. Follow them for every reply. Answer directly in " +
    "plain text; never use tools, never read or edit files.\n\n" +
    `${systemPrompt}\n\n---\n\n${userMessage}`
  );
}

// Stateful mapping from Codex thread events to provider events. Codex item
// events carry the full item text so far, so the mapper tracks per-item
// last-text and emits only the newly appended suffix as a delta. Returns null
// for events the app does not care about (reasoning, tool items, etc.).
export class CodexEventMapper {
  // Insertion-ordered so fullText joins agent messages in arrival order.
  private itemText = new Map<string, string>();

  map(event: ThreadEvent): ProviderEvent | null {
    switch (event.type) {
      case "thread.started":
        return { type: "session", sessionRef: event.thread_id };
      case "item.started":
      case "item.updated":
      case "item.completed":
        return this.mapItem(event.item);
      case "turn.completed":
        return { type: "done", fullText: this.fullText() };
      case "turn.failed":
        return {
          type: "error",
          code: inferErrorCode(event.error.message),
          message: event.error.message,
        };
      case "error":
        return {
          type: "error",
          code: inferErrorCode(event.message),
          message: event.message,
        };
      default:
        return null;
    }
  }

  private mapItem(item: ThreadItem): ProviderEvent | null {
    if (item.type !== "agent_message") return null;
    const prev = this.itemText.get(item.id) ?? "";
    const next = item.text;
    this.itemText.set(item.id, next);
    if (next.startsWith(prev)) {
      const suffix = next.slice(prev.length);
      return suffix ? { type: "delta", text: suffix } : null;
    }
    // item.completed text diverged from what streamed (rare). The stored text
    // is reconciled above, so the terminal done event's fullText is
    // authoritative; emit no delta to avoid duplicating visible text.
    return null;
  }

  fullText(): string {
    return [...this.itemText.values()].join("\n\n");
  }
}

function buildCodexOptions(): CodexOptions {
  const options: CodexOptions = {};
  if (process.env.CODEX_BIN) options.codexPathOverride = process.env.CODEX_BIN;
  return options;
}

function buildThreadOptions(model?: string): ThreadOptions {
  // The scratch dir normally exists once the db client has opened, but the
  // adapters must not depend on that ordering.
  mkdirSync(scratchDir, { recursive: true });
  const options: ThreadOptions = {
    sandboxMode: "read-only",
    workingDirectory: scratchDir,
    skipGitRepoCheck: true,
  };
  if (model !== undefined) options.model = model;
  return options;
}

// One runStreamed() attempt. Never throws: every failure becomes an error
// event, and the generator always ends with exactly one terminal done/error.
async function* attemptStream(
  cfg: { prompt: string; sessionRef?: string; model?: string },
  signal?: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  const mapper = new CodexEventMapper();
  try {
    const codex = new Codex(buildCodexOptions());
    const options = buildThreadOptions(cfg.model);
    const thread = cfg.sessionRef
      ? codex.resumeThread(cfg.sessionRef, options)
      : codex.startThread(options);
    const { events } = await thread.runStreamed(cfg.prompt, signal ? { signal } : undefined);
    for await (const raw of events) {
      const ev = mapper.map(raw);
      if (!ev) continue;
      yield ev;
      if (ev.type === "done" || ev.type === "error") return;
    }
    yield {
      type: "error",
      code: "unknown",
      message: "Codex stream ended without a result",
    };
  } catch (err) {
    yield errorEventFromUnknown(err);
  }
}

export const codexProvider: LLMProvider = {
  id: "codex",
  label: "Codex (Codex CLI)",

  async *streamTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
    const canReplay = Boolean(
      req.sessionRef && req.transcript && req.transcript.length > 0,
    );
    const prompt = req.sessionRef
      ? req.userMessage
      : composeFirstTurnPrompt(req.systemPrompt, req.userMessage);
    for await (const ev of attemptStream(
      { prompt, sessionRef: req.sessionRef, model: req.model },
      signal,
    )) {
      if (ev.type === "error" && ev.code === "session_expired" && canReplay) {
        // The provider thread is gone; retry once with a fresh thread whose
        // first-turn prompt embeds the stored transcript. The fresh attempt
        // emits its own `session` event so the caller can persist the new ref.
        const replayPrompt = composeFirstTurnPrompt(
          buildReplaySystemPrompt(req.systemPrompt, req.transcript!),
          req.userMessage,
        );
        yield* attemptStream({ prompt: replayPrompt, model: req.model }, signal);
        return;
      }
      yield ev;
      if (ev.type === "done" || ev.type === "error") return;
    }
  },

  async completeOnce(req: CompleteOnceRequest, signal?: AbortSignal): Promise<string> {
    try {
      const codex = new Codex(buildCodexOptions());
      const thread = codex.startThread(buildThreadOptions(req.model));
      const turn = await thread.run(
        composeFirstTurnPrompt(req.systemPrompt, req.userMessage),
        signal ? { signal } : undefined,
      );
      return turn.finalResponse;
    } catch (err) {
      if (err instanceof ProviderCallError) throw err;
      const ev = errorEventFromUnknown(err);
      throw new ProviderCallError(ev.code, ev.message);
    }
  },

  checkAuth: checkCodexAuth,
};
