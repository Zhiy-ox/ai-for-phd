// CLI auth detection for both providers. Results are cached in-module for
// five minutes because these checks spawn subprocesses and the settings page
// polls them.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claudeBinary, codexBinary } from "./binaries";
import type { AuthStatus } from "./types";

const execFileAsync = promisify(execFile);

const EXEC_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const CLAUDE_FIX = "Run `claude` in Terminal and log in";
const CODEX_FIX = "Run `codex login` in Terminal";

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}

async function runStatusCommand(
  bin: string,
  args: string[],
): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: EXEC_TIMEOUT_MS,
    });
    return { ok: true, output: `${stdout}\n${stderr}`.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim() || (e.message ?? "");
    return { ok: false, output };
  }
}

export async function checkClaudeAuth(): Promise<AuthStatus> {
  const bin = claudeBinary();
  if (!bin) {
    return {
      ok: false,
      detail:
        "Claude Code CLI not found — install it (https://claude.com/claude-code), then log in with `claude`.",
    };
  }
  const { ok, output } = await runStatusCommand(bin, ["auth", "status"]);
  // `claude auth status` prints JSON: { loggedIn, email, subscriptionType, … }
  try {
    const parsed = JSON.parse(output) as {
      loggedIn?: boolean;
      email?: string;
      subscriptionType?: string;
    };
    if (parsed.loggedIn === false) return { ok: false, detail: CLAUDE_FIX };
    if (parsed.loggedIn === true) {
      const who = [parsed.email, parsed.subscriptionType].filter(Boolean).join(" · ");
      return { ok: true, detail: who ? `Logged in (${who})` : "Logged in" };
    }
  } catch {
    // Not JSON — fall through to the text heuristics.
  }
  if (!ok || /not.*log/i.test(output)) {
    return { ok: false, detail: CLAUDE_FIX };
  }
  return { ok: true, detail: firstLine(output) || "Logged in" };
}

export async function checkCodexAuth(): Promise<AuthStatus> {
  const bin = codexBinary();
  if (!bin) {
    return {
      ok: false,
      detail:
        "Codex CLI not found — install it (`npm i -g @openai/codex` or `brew install codex`), then run `codex login`.",
    };
  }
  const { ok, output } = await runStatusCommand(bin, ["login", "status"]);
  if (!ok || /not.*logged.*in/i.test(output)) {
    return { ok: false, detail: CODEX_FIX };
  }
  return { ok: true, detail: firstLine(output) || "Logged in" };
}

interface ProvidersStatus {
  claude: AuthStatus;
  codex: AuthStatus;
}

let cache: { at: number; value: ProvidersStatus } | null = null;

export async function getProvidersStatus(): Promise<ProvidersStatus> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const [claude, codex] = await Promise.all([checkClaudeAuth(), checkCodexAuth()]);
  const value = { claude, codex };
  cache = { at: Date.now(), value };
  return value;
}

// For tests and for a future "re-check now" button.
export function clearProvidersStatusCache(): void {
  cache = null;
}
