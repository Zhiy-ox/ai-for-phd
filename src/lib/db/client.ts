import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

export const dataDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "data");
export const documentsDir = path.join(dataDir, "documents");
// Empty directory handed to the agent runtimes as cwd so they have nothing to
// read or edit even if a tool call slipped through.
export const scratchDir = path.join(dataDir, "agent-scratch");

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

function open(): DatabaseSync {
  mkdirSync(documentsDir, { recursive: true });
  mkdirSync(scratchDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "app.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

declare global {
   
  var __aiPhdDb: DatabaseSync | undefined;
}

// Singleton that survives Next dev-server hot reloads.
export function getDb(): DatabaseSync {
  globalThis.__aiPhdDb ??= open();
  return globalThis.__aiPhdDb;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
