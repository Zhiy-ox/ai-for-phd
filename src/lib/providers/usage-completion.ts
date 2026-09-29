// Quota-memory integration for one-shot structured completions. The shared
// JSON parser deliberately stays provider/DB independent; this adapter tracks
// each underlying provider attempt, including the parser's one retry.
import type { z } from "zod";
import {
  completeJsonWithRetry,
  type CompleteJsonResult,
} from "@/lib/shared/json-extract";
import {
  ProviderCallError,
  type CompleteOnceRequest,
  type LLMProvider,
} from "./types";
import { clearUsageLimit, recordUsageLimit } from "./usage";

function withUsageMemory(provider: LLMProvider): LLMProvider {
  return {
    id: provider.id,
    label: provider.label,
    streamTurn(req, signal) {
      return provider.streamTurn(req, signal);
    },
    async completeOnce(req, signal) {
      try {
        const text = await provider.completeOnce(req, signal);
        // A returned response proves the provider accepted this attempt,
        // even when its text later fails JSON/schema validation.
        clearUsageLimit(provider.id);
        return text;
      } catch (err) {
        if (err instanceof ProviderCallError && err.code === "usage_limit") {
          recordUsageLimit(provider.id);
        }
        // Preserve the exact provider failure; quota memory is advisory.
        throw err;
      }
    },
    checkAuth() {
      return provider.checkAuth();
    },
  };
}

export function completeJsonWithUsageTracking<T>(
  provider: LLMProvider,
  req: CompleteOnceRequest,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<CompleteJsonResult<T>> {
  return completeJsonWithRetry(withUsageMemory(provider), req, schema, signal);
}
