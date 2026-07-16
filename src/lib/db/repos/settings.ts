import { getDb } from "../client";
import type { ProviderId } from "@/lib/providers/types";

export interface AppSettings {
  default_provider: ProviderId;
  // Empty string means "use the provider's own default model".
  claude_model: string;
  codex_model: string;
  // Stage id the user says they are at; "" means never set (fall back to
  // the first active stage instance).
  current_stage: string;
  // Programme template id; "" means the built-in default.
  programme_id: string;
  // "1" once the first-run wizard has completed.
  onboarded: string;
  // ISO timestamp of the provider's last usage_limit error; "" = none seen.
  // Set/cleared by lib/providers/usage.ts as sessions hit or clear limits.
  claude_limited_at: string;
  codex_limited_at: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  default_provider: "claude",
  claude_model: "claude-sonnet-4-5",
  codex_model: "",
  current_stage: "",
  programme_id: "",
  onboarded: "",
  claude_limited_at: "",
  codex_limited_at: "",
};

export function getSettings(): AppSettings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    upsert.run(key, String(value));
  }
  return getSettings();
}
