// Shared helpers for getting structured JSON out of LLM text output.
// Used by the viva planner, the viva assessment report, and the doc review.
import type { z } from "zod";
import type { CompleteOnceRequest, LLMProvider } from "@/lib/providers/types";

/**
 * Extracts a JSON value from model output. Prefers the LAST fenced
 * ```json ... ``` block, then the last plain ``` ... ``` block, then falls
 * back to best-effort balanced-brace matching over the whole text.
 * Throws if nothing parseable is found.
 */
export function extractFencedJson(text: string): unknown {
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let lastJsonBlock: string | undefined;
  let lastAnyBlock: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    lastAnyBlock = m[2];
    if (m[1].trim().toLowerCase().startsWith("json")) lastJsonBlock = m[2];
  }
  for (const block of [lastJsonBlock, lastAnyBlock]) {
    if (block === undefined) continue;
    try {
      return JSON.parse(block.trim());
    } catch {
      // Fall through to brace matching (the fence may contain extra prose).
    }
  }
  const braced = tryBalancedJson(text);
  if (braced) return braced.value;
  throw new Error("No JSON block found in model output");
}

function tryBalancedJson(text: string): { value: unknown } | undefined {
  let attempts = 0;
  for (let i = 0; i < text.length && attempts < 50; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    attempts += 1;
    const end = findBalancedEnd(text, i);
    if (end === -1) continue;
    try {
      return { value: JSON.parse(text.slice(i, end + 1)) };
    } catch {
      // Try the next opening bracket.
    }
  }
  return undefined;
}

function findBalancedEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export type CompleteJsonResult<T> =
  | { ok: true; value: T; rawText: string }
  | { ok: false; rawText: string; error: string };

/**
 * Runs provider.completeOnce, extracts fenced JSON, and validates it against
 * the given zod schema. On failure, retries ONCE with an explicit
 * "your JSON was invalid, re-emit exactly per schema" message. On a second
 * failure returns { ok: false } with the last raw text — callers decide the
 * fallback (skip the plan / store raw markdown).
 */
export async function completeJsonWithRetry<T>(
  provider: LLMProvider,
  req: CompleteOnceRequest,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<CompleteJsonResult<T>> {
  const first = await provider.completeOnce(req, signal);
  const attempt1 = parseAgainstSchema(first, schema);
  if (attempt1.ok) return { ok: true, value: attempt1.value, rawText: first };

  const retryMessage = [
    req.userMessage,
    "",
    `Your previous JSON was invalid (${attempt1.error}). Your previous response was:`,
    "---",
    first.length > 4000 ? `${first.slice(0, 4000)}\n[...truncated]` : first,
    "---",
    "Re-emit your complete answer now as a single fenced ```json code block that exactly matches the required schema. Output nothing outside the fenced block.",
  ].join("\n");
  const second = await provider.completeOnce(
    { systemPrompt: req.systemPrompt, userMessage: retryMessage, model: req.model },
    signal,
  );
  const attempt2 = parseAgainstSchema(second, schema);
  if (attempt2.ok) return { ok: true, value: attempt2.value, rawText: second };
  return { ok: false, rawText: second, error: attempt2.error };
}

function parseAgainstSchema<T>(
  raw: string,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = extractFencedJson(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: issues || "schema validation failed" };
}
