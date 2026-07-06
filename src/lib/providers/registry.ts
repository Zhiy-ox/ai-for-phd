import { getSettings } from "@/lib/db/repos/settings";
import type { LLMProvider, ProviderId } from "./types";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";

const providers: Record<ProviderId, LLMProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function getProvider(id: ProviderId): LLMProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function listProviders(): LLMProvider[] {
  return Object.values(providers);
}

// Applies settings defaults for provider choice and model. An explicit model
// of "" falls back to the settings model, then the provider default.
export function resolveProviderAndModel(opts?: {
  provider?: ProviderId;
  model?: string;
}): { provider: LLMProvider; model?: string } {
  const settings = getSettings();
  const id = opts?.provider ?? settings.default_provider;
  const provider = getProvider(id);
  const settingsModel = id === "claude" ? settings.claude_model : settings.codex_model;
  const model = opts?.model || settingsModel || undefined;
  return { provider, model };
}
