// The seam between the app and the two CLI-backed agent runtimes. Everything
// above this interface is provider-agnostic; a raw-API provider for cloud
// deployment would be a third implementation of LLMProvider.

export type ProviderId = "claude" | "codex";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TurnRequest {
  // Applied on the first turn of a provider session only; continuation turns
  // rely on the provider's own session/thread memory.
  systemPrompt: string;
  userMessage: string;
  // Provider session/thread id to continue. Omit to start a new session.
  sessionRef?: string;
  // Replay fallback: when resuming sessionRef fails, implementations retry
  // with a fresh session whose system prompt embeds this transcript.
  transcript?: ChatMessage[];
  // Empty/undefined means the provider's default model.
  model?: string;
}

export interface CompleteOnceRequest {
  systemPrompt: string;
  userMessage: string;
  model?: string;
}

export type ProviderErrorCode =
  | "not_logged_in"
  | "spawn_failed"
  | "session_expired"
  | "usage_limit"
  | "unknown";

export type ProviderEvent =
  | { type: "delta"; text: string }
  | { type: "session"; sessionRef: string }
  | { type: "done"; fullText: string }
  | { type: "error"; code: ProviderErrorCode; message: string };

export interface AuthStatus {
  ok: boolean;
  // Human-readable: version/account when ok, fix instruction when not.
  detail: string;
}

export interface LLMProvider {
  id: ProviderId;
  label: string;
  // Streams one conversational turn. Must emit `session` (once, when a new
  // provider session is created), zero or more `delta`s, then exactly one
  // terminal `done` or `error`. Must never throw — map failures to an error
  // event so SSE consumers can render them.
  streamTurn(req: TurnRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent>;
  // One-shot, non-streaming completion for planner/review/report calls.
  // Throws ProviderCallError on failure.
  completeOnce(req: CompleteOnceRequest, signal?: AbortSignal): Promise<string>;
  checkAuth(): Promise<AuthStatus>;
}

export class ProviderCallError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}
