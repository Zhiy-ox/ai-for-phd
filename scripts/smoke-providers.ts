// Manual smoke test for the two LLM provider adapters. This spends real
// subscription quota on every run — run deliberately, by hand:
//   npx tsx scripts/smoke-providers.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AuthStatus, LLMProvider, TurnRequest } from "@/lib/providers/types";

// Tiny KEY=VALUE parser for .env.local. Must run before the provider modules
// are imported, since dataDir/CLAUDE_BIN/CODEX_BIN are read from process.env.
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const SYSTEM_PROMPT =
  "You are a smoke-test assistant. Reply in plain text, as briefly as possible.";

async function streamOnce(
  provider: LLMProvider,
  req: TurnRequest,
): Promise<{ sessionRef?: string; fullText: string; ms: number }> {
  const t0 = Date.now();
  let sessionRef: string | undefined;
  let fullText = "";
  for await (const ev of provider.streamTurn(req)) {
    if (ev.type === "session") {
      sessionRef = ev.sessionRef;
    } else if (ev.type === "delta") {
      process.stdout.write(ev.text);
    } else if (ev.type === "done") {
      fullText = ev.fullText;
    } else {
      throw new Error(`stream error [${ev.code}]: ${ev.message}`);
    }
  }
  process.stdout.write("\n");
  return { sessionRef, fullText, ms: Date.now() - t0 };
}

async function smokeProvider(provider: LLMProvider): Promise<void> {
  console.log(`\n=== ${provider.label} (${provider.id}) ===`);

  const t0 = Date.now();
  const pong = await provider.completeOnce({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: "Reply with exactly: pong",
  });
  console.log(`completeOnce  ${Date.now() - t0}ms → ${JSON.stringify(pong.trim())}`);

  const turn1 = await streamOnce(provider, {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: "Say A",
  });
  console.log(
    `streamTurn 1  ${turn1.ms}ms sessionRef=${turn1.sessionRef ?? "(none)"} → ` +
      JSON.stringify(turn1.fullText.trim()),
  );
  if (!turn1.sessionRef) {
    throw new Error("turn 1 emitted no session event; cannot test resumption");
  }

  const turn2 = await streamOnce(provider, {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: "Now say B",
    sessionRef: turn1.sessionRef,
  });
  console.log(
    `streamTurn 2  ${turn2.ms}ms sessionRef=${turn2.sessionRef ?? "(reused)"} → ` +
      JSON.stringify(turn2.fullText.trim()),
  );
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { getProvidersStatus } = await import("@/lib/providers/auth-status");
  const { claudeProvider } = await import("@/lib/providers/claude");
  const { codexProvider } = await import("@/lib/providers/codex");

  const status = await getProvidersStatus();
  console.log(`claude: ${status.claude.ok ? "ok" : "NOT AUTHENTICATED"} — ${status.claude.detail}`);
  console.log(`codex:  ${status.codex.ok ? "ok" : "NOT AUTHENTICATED"} — ${status.codex.detail}`);

  const runs: [LLMProvider, AuthStatus][] = [
    [claudeProvider, status.claude],
    [codexProvider, status.codex],
  ];
  for (const [provider, auth] of runs) {
    if (!auth.ok) {
      console.log(`\n=== ${provider.label} (${provider.id}): skipped — ${auth.detail}`);
      continue;
    }
    await smokeProvider(provider);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
