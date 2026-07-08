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
}

export const DEFAULT_SETTINGS: AppSettings = {
  default_provider: "claude",
  claude_model: "claude-sonnet-4-5",
  codex_model: "",
  current_stage: "",
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
