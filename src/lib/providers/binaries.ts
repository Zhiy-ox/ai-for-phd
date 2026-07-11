// Locates the claude / codex CLIs without requiring any configuration.
// Resolution order: explicit env var → $PATH → common install locations.
// .env.local (CLAUDE_BIN / CODEX_BIN) still wins when present.
import { accessSync, constants } from "node:fs";
import path from "node:path";
import os from "node:os";

const COMMON_DIRS = [
  path.join(os.homedir(), ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  path.join(os.homedir(), ".npm-global", "bin"),
  path.join(os.homedir(), "bin"),
];

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, string | null>();

function locate(name: string, envVar: string): string | null {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  let found: string | null = null;
  const fromEnv = process.env[envVar];
  if (fromEnv && isExecutable(fromEnv)) {
    found = fromEnv;
  } else {
    const dirs = [...(process.env.PATH ?? "").split(path.delimiter), ...COMMON_DIRS];
    for (const dir of dirs) {
      if (!dir) continue;
      const candidate = path.join(dir, name);
      if (isExecutable(candidate)) {
        found = candidate;
        break;
      }
    }
  }
  cache.set(name, found);
  return found;
}

// Resolved path, or null when the CLI is not installed anywhere we can see.
export function claudeBinary(): string | null {
  return locate("claude", "CLAUDE_BIN");
}

export function codexBinary(): string | null {
  return locate("codex", "CODEX_BIN");
}

// For tests / after the user installs a CLI mid-session.
export function clearBinaryCache(): void {
  cache.clear();
}
