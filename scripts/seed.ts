// Seed stage instances for the default programme. Idempotent — safe to run
// repeatedly. Run with: npx tsx scripts/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";

// Tiny KEY=VALUE parser for .env.local. Must run before the db client is
// imported, since dataDir is resolved from process.env.DATA_DIR at import.
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

async function main(): Promise<void> {
  loadEnvLocal();
  const { getProgramme, DEFAULT_PROGRAMME_ID } = await import("@/lib/template");
  const { ensureSeeded, listStageInstances } = await import("@/lib/db/repos/stage-instances");

  const programme = getProgramme(DEFAULT_PROGRAMME_ID);
  ensureSeeded(programme);
  const instances = listStageInstances(programme.id);

  console.log(`Programme: ${programme.name} (${programme.id})`);
  console.log(`Stage instances (${instances.length}):`);
  for (const inst of instances) {
    const target = inst.target_date ? `  target=${inst.target_date}` : "";
    const notes = inst.notes ? `  notes=${JSON.stringify(inst.notes)}` : "";
    console.log(`  ${inst.stage_id.padEnd(20)} ${inst.status}${target}${notes}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
