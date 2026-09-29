// Migration v5 backfills programme ownership. A document must follow the
// sessions that examined it, not whichever programme happens to be selected
// at upgrade time — otherwise the ownership check orphans it.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "@/lib/db/migrations";

function v4Database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const sql of MIGRATIONS.slice(0, 4)) db.exec(sql);
  return db;
}

function insertDoc(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO documents (id, filename, kind, stage_id, file_path, created_at, updated_at)
     VALUES (?, ?, 'transfer_report', 'transfer', '/tmp/x', '2026-01-01', '2026-01-01')`,
  ).run(id, `${id}.md`);
}

function insertSession(
  db: DatabaseSync,
  id: string,
  config: string,
  createdAt = "2026-01-02",
): void {
  db.prepare(
    `INSERT INTO sessions (id, type, stage_id, provider, config_json, created_at)
     VALUES (?, 'viva', 'transfer', 'codex', ?, ?)`,
  ).run(id, config, createdAt);
}

function programmeOf(db: DatabaseSync, table: "documents" | "sessions", id: string): string {
  const row = db.prepare(`SELECT programme_id FROM ${table} WHERE id = ?`).get(id) as {
    programme_id: string;
  };
  return row.programme_id;
}

describe("migration v5 programme backfill", () => {
  it("gives a document the programme of the session that used it", () => {
    const db = v4Database();
    insertDoc(db, "doc-oxford");
    insertSession(
      db,
      "sess-oxford",
      JSON.stringify({ programmeId: "oxford-dphil", documentIds: ["doc-oxford"] }),
    );
    // The user switched programmes before upgrading.
    db.prepare("INSERT INTO settings (key, value) VALUES ('programme_id', 'generic-uk-phd')").run();

    db.exec(MIGRATIONS[4]);

    expect(programmeOf(db, "documents", "doc-oxford")).toBe("oxford-dphil");
    expect(programmeOf(db, "sessions", "sess-oxford")).toBe("oxford-dphil");
  });

  it("uses the earliest session when several programmes touched a document", () => {
    const db = v4Database();
    insertDoc(db, "doc-shared");
    insertSession(
      db,
      "sess-later",
      JSON.stringify({ programmeId: "us-phd", documentIds: ["doc-shared"] }),
      "2026-03-01",
    );
    insertSession(
      db,
      "sess-first",
      JSON.stringify({ programmeId: "generic-uk-phd", documentIds: ["doc-shared"] }),
      "2026-02-01",
    );

    db.exec(MIGRATIONS[4]);

    expect(programmeOf(db, "documents", "doc-shared")).toBe("generic-uk-phd");
  });

  it("falls back to the selected programme, then the default, for unused documents", () => {
    const withSetting = v4Database();
    insertDoc(withSetting, "doc-unused");
    withSetting
      .prepare("INSERT INTO settings (key, value) VALUES ('programme_id', 'us-phd')")
      .run();
    withSetting.exec(MIGRATIONS[4]);
    expect(programmeOf(withSetting, "documents", "doc-unused")).toBe("us-phd");

    const bare = v4Database();
    insertDoc(bare, "doc-bare");
    bare.exec(MIGRATIONS[4]);
    expect(programmeOf(bare, "documents", "doc-bare")).toBe("oxford-dphil");
  });

  it("survives malformed session configs", () => {
    const db = v4Database();
    insertDoc(db, "doc-x");
    insertSession(db, "sess-bad", "{not json");
    insertSession(db, "sess-retired", JSON.stringify({ programmeId: "retired", documentIds: ["doc-x"] }));

    db.exec(MIGRATIONS[4]);

    expect(programmeOf(db, "documents", "doc-x")).toBe("oxford-dphil");
    expect(programmeOf(db, "sessions", "sess-bad")).toBe("oxford-dphil");
  });
});
