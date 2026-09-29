import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "@/lib/db/migrations";

const dataDir = mkdtempSync(path.join(tmpdir(), "aiphd-stage-activity-"));
mkdirSync(dataDir, { recursive: true });
process.env.DATA_DIR = dataDir;

// Recreate a real v4 database so the v5 import exercises the shipped upgrade
// path, rather than testing only a fresh install.
const legacyDb = new DatabaseSync(path.join(dataDir, "app.db"));
for (const migration of MIGRATIONS.slice(0, 4)) legacyDb.exec(migration);
legacyDb.prepare("INSERT INTO settings (key, value) VALUES ('programme_id', ?)").run(
  "generic-uk-phd",
);
legacyDb
  .prepare(
    `INSERT INTO documents
       (id, filename, kind, stage_id, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    "legacy-document",
    "legacy.md",
    "proposal",
    "upgrade",
    "/tmp/legacy.md",
    "2026-07-01T00:00:00.000Z",
    "2026-07-01T00:00:00.000Z",
  );
legacyDb
  .prepare(
    `INSERT INTO sessions
       (id, type, stage_id, provider, status, config_json, created_at)
     VALUES (?, 'viva', ?, 'codex', 'active', ?, ?)`,
  )
  .run(
    "legacy-config-session",
    "transfer",
    JSON.stringify({ programmeId: "oxford-dphil", stageId: "transfer" }),
    "2026-07-01T00:00:00.000Z",
  );
legacyDb
  .prepare(
    `INSERT INTO sessions
       (id, type, stage_id, provider, status, config_json, created_at)
     VALUES (?, 'viva', ?, 'codex', 'active', '{}', ?)`,
  )
  .run("legacy-fallback-session", "upgrade", "2026-07-01T00:00:00.000Z");
legacyDb
  .prepare(
    `INSERT INTO sessions
       (id, type, stage_id, provider, status, config_json, created_at)
     VALUES (?, 'viva', ?, 'codex', 'active', ?, ?)`,
  )
  .run(
    "legacy-invalid-config-session",
    "upgrade",
    JSON.stringify({ programmeId: "retired-programme", stageId: "upgrade" }),
    "2026-07-01T00:00:00.000Z",
  );
legacyDb.exec("PRAGMA user_version = 4");
legacyDb.close();

const { getDb } = await import("@/lib/db/client");
const { insertDocument, listDocuments, updateExtraction } = await import(
  "@/lib/db/repos/documents"
);
const { createSession, endSession, listSessions } = await import("@/lib/db/repos/sessions");
const { insertReport, listReports } = await import("@/lib/db/repos/reports");
const { getStageActivity } = await import("@/lib/db/repos/stage-activity");
const { getSettings, setSettings } = await import("@/lib/db/repos/settings");
const { GET: getActivityRoute } = await import("@/app/api/stages/[stageId]/activity/route");
const { GET: getDocumentsRoute } = await import("@/app/api/documents/route");
const { GET: getSessionsRoute } = await import("@/app/api/sessions/route");
const { GET: getReportsRoute } = await import("@/app/api/reports/route");
const { PUT: putSettingsRoute } = await import("@/app/api/settings/route");

describe("programme-scoped stage activity", () => {
  it("starts empty stages at not_started", () => {
    expect(getStageActivity("us-phd", "papers")).toEqual({
      readable: 0,
      reviews: 0,
      reports: 0,
      latestReportId: null,
      panelState: "not_started",
    });
  });

  it("backfills v4 rows from session config and the active programme", () => {
    const db = getDb();
    expect(
      db.prepare("SELECT programme_id FROM documents WHERE id = 'legacy-document'").get(),
    ).toEqual({ programme_id: "generic-uk-phd" });
    expect(
      db.prepare("SELECT programme_id FROM sessions WHERE id = 'legacy-config-session'").get(),
    ).toEqual({ programme_id: "oxford-dphil" });
    expect(
      db.prepare("SELECT programme_id FROM sessions WHERE id = 'legacy-fallback-session'").get(),
    ).toEqual({ programme_id: "generic-uk-phd" });
    expect(
      db.prepare("SELECT programme_id FROM sessions WHERE id = 'legacy-invalid-config-session'").get(),
    ).toEqual({ programme_id: "generic-uk-phd" });
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: MIGRATIONS.length });
  });

  it("falls back to Oxford when legacy settings and config programme ids are invalid", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const migration of MIGRATIONS.slice(0, 4)) db.exec(migration);
      db.prepare("INSERT INTO settings (key, value) VALUES ('programme_id', ?)").run(
        "retired-programme",
      );
      db.prepare(
        `INSERT INTO documents
           (id, filename, kind, stage_id, file_path, created_at, updated_at)
         VALUES ('legacy-doc', 'legacy.md', 'proposal', 'transfer', '/tmp/legacy.md', ?, ?)`,
      ).run("2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");

      const insertSession = db.prepare(
        `INSERT INTO sessions
           (id, type, stage_id, provider, status, config_json, created_at)
         VALUES (?, 'viva', 'transfer', 'codex', 'active', ?, ?)`,
      );
      insertSession.run(
        "valid-config",
        JSON.stringify({ programmeId: "us-phd", stageId: "transfer" }),
        "2026-07-01T00:00:00.000Z",
      );
      insertSession.run(
        "invalid-config",
        JSON.stringify({ programmeId: "retired-programme", stageId: "transfer" }),
        "2026-07-01T00:00:00.000Z",
      );
      insertSession.run("malformed-config", "not-json", "2026-07-01T00:00:00.000Z");

      db.exec(MIGRATIONS[4]);

      expect(db.prepare("SELECT programme_id FROM documents WHERE id = 'legacy-doc'").get()).toEqual({
        programme_id: "oxford-dphil",
      });
      expect(db.prepare("SELECT programme_id FROM sessions WHERE id = 'valid-config'").get()).toEqual({
        programme_id: "us-phd",
      });
      expect(db.prepare("SELECT programme_id FROM sessions WHERE id = 'invalid-config'").get()).toEqual({
        programme_id: "oxford-dphil",
      });
      expect(db.prepare("SELECT programme_id FROM sessions WHERE id = 'malformed-config'").get()).toEqual({
        programme_id: "oxford-dphil",
      });
    } finally {
      db.close();
    }
  });

  it("persists and filters new documents and sessions by programme", () => {
    const oxfordDoc = insertDocument({
      programmeId: "oxford-dphil",
      filename: "oxford-paper.md",
      kind: "paper",
      stageId: "papers",
      filePath: "/tmp/oxford-paper.md",
    });
    updateExtraction(oxfordDoc.id, { text: "Synthetic Oxford paper", charCount: 22 });

    const genericDoc = insertDocument({
      programmeId: "generic-uk-phd",
      filename: "generic-paper.md",
      kind: "paper",
      stageId: "papers",
      filePath: "/tmp/generic-paper.md",
    });
    updateExtraction(genericDoc.id, { text: "Synthetic generic paper", charCount: 23 });
    const genericDocTwo = insertDocument({
      programmeId: "generic-uk-phd",
      filename: "generic-supporting.md",
      kind: "referee_reports",
      stageId: "papers",
      filePath: "/tmp/generic-supporting.md",
    });
    updateExtraction(genericDocTwo.id, { text: "Synthetic reports", charCount: 17 });

    const oxfordSession = createSession({
      programmeId: "oxford-dphil",
      type: "viva",
      stageId: "papers",
      provider: "codex",
      config: { programmeId: "oxford-dphil", stageId: "papers", documentIds: [] },
    });
    const genericSession = createSession({
      programmeId: "generic-uk-phd",
      type: "viva",
      stageId: "papers",
      provider: "codex",
      config: { programmeId: "generic-uk-phd", stageId: "papers", documentIds: [] },
    });

    expect(oxfordDoc.programme_id).toBe("oxford-dphil");
    expect(oxfordSession.programme_id).toBe("oxford-dphil");
    expect(listDocuments({ programmeId: "oxford-dphil", stageId: "papers" })).toHaveLength(1);
    expect(listDocuments({ programmeId: "generic-uk-phd", stageId: "papers" })).toHaveLength(2);
    expect(listSessions({ programmeId: "oxford-dphil", stageId: "papers" })).toHaveLength(1);
    expect(listSessions({ programmeId: "generic-uk-phd", stageId: "papers" })).toHaveLength(1);

    const oxfordReview = insertReport({
      documentId: oxfordDoc.id,
      type: "doc_review",
      rubric: { format: "peer_review", sentinel: "OXFORD_PRIVATE_RUBRIC" },
      contentMd: "OXFORD_PRIVATE_REPORT_BODY",
    });
    const genericReview = insertReport({
      documentId: genericDoc.id,
      type: "doc_review",
      rubric: { sentinel: "GENERIC_PRIVATE_RUBRIC" },
      contentMd: "GENERIC_PRIVATE_REPORT_BODY",
    });

    expect(getStageActivity("oxford-dphil", "papers")).toEqual({
      readable: 1,
      reviews: 1,
      reports: 1,
      latestReportId: oxfordReview.id,
      panelState: "in_progress",
    });
    expect(getStageActivity("generic-uk-phd", "papers")).toEqual({
      readable: 1,
      reviews: 0,
      reports: 1,
      latestReportId: genericReview.id,
      panelState: "in_progress",
    });

    // An active session may have been abandoned; merely creating it must not
    // turn the panel step green.
    expect(getStageActivity("oxford-dphil", "papers").panelState).toBe("in_progress");
    const assessment = insertReport({
      sessionId: oxfordSession.id,
      type: "viva_assessment",
      contentMd: "Synthetic assessment",
    });
    expect(getStageActivity("oxford-dphil", "papers")).toEqual({
      readable: 1,
      reviews: 1,
      reports: 2,
      latestReportId: assessment.id,
      panelState: "complete",
    });

    // Ending a session also proves completion, even before an assessment is
    // generated; an errored/active session would remain in progress.
    endSession(genericSession.id);
    expect(getStageActivity("generic-uk-phd", "papers").panelState).toBe("complete");

    expect(
      listReports({ programmeId: "oxford-dphil", stageId: "papers" }).map((r) => r.id),
    ).toContain(oxfordReview.id);
    expect(
      listReports({ programmeId: "generic-uk-phd", stageId: "papers" }).map((r) => r.id),
    ).not.toContain(oxfordReview.id);
  });

  it("switches all collection routes with the active programme", async () => {
    setSettings({ programme_id: "oxford-dphil" });
    const oxfordActivityResponse = await getActivityRoute(
      new Request("http://localhost/api/stages/papers/activity"),
      { params: Promise.resolve({ stageId: "papers" }) },
    );
    const oxfordActivity = await oxfordActivityResponse.json();
    expect(oxfordActivity).toEqual({
      activity: {
        readable: 1,
        reviews: 1,
        reports: 2,
        latestReportId: listReports({ programmeId: "oxford-dphil", stageId: "papers" })[0].id,
        panelState: "complete",
      },
    });
    expect(JSON.stringify(oxfordActivity)).not.toContain("PRIVATE_REPORT_BODY");
    expect(JSON.stringify(oxfordActivity)).not.toContain("PRIVATE_RUBRIC");

    setSettings({ programme_id: "generic-uk-phd" });
    const genericActivityResponse = await getActivityRoute(
      new Request("http://localhost/api/stages/papers/activity"),
      { params: Promise.resolve({ stageId: "papers" }) },
    );
    expect(await genericActivityResponse.json()).toEqual({
      activity: {
        readable: 1,
        reviews: 0,
        reports: 1,
        latestReportId: listReports({ programmeId: "generic-uk-phd", stageId: "papers" })[0].id,
        panelState: "complete",
      },
    });

    const documents = await (
      await getDocumentsRoute(new Request("http://localhost/api/documents?stageId=papers"))
    ).json();
    expect(documents.documents).toHaveLength(2);
    expect(documents.documents.every((doc: { programme_id: string }) => doc.programme_id === "generic-uk-phd")).toBe(true);

    const sessions = await (
      await getSessionsRoute(new Request("http://localhost/api/sessions?stageId=papers"))
    ).json();
    expect(sessions.sessions).toHaveLength(1);
    expect(sessions.sessions[0].programme_id).toBe("generic-uk-phd");

    const reports = await (
      await getReportsRoute(new Request("http://localhost/api/reports?stageId=papers"))
    ).json();
    expect(reports.reports).toHaveLength(1);
    expect(reports.reports[0].content_md).toBe("GENERIC_PRIVATE_REPORT_BODY");

    const summaries = await (
      await getReportsRoute(
        new Request("http://localhost/api/reports?stageId=papers&summary=1"),
      )
    ).json();
    expect(summaries.reports).toHaveLength(1);
    expect(summaries.reports[0]).not.toHaveProperty("content_md");
    expect(summaries.reports[0]).not.toHaveProperty("rubric_json");
    expect(JSON.stringify(summaries)).not.toContain("PRIVATE_REPORT_BODY");
    expect(JSON.stringify(summaries)).not.toContain("PRIVATE_RUBRIC");
  });

  it("returns 404 for a stage outside the active programme", async () => {
    setSettings({ programme_id: "generic-uk-phd" });
    const response = await getActivityRoute(
      new Request("http://localhost/api/stages/transfer/activity"),
      { params: Promise.resolve({ stageId: "transfer" }) },
    );
    expect(response.status).toBe(404);
  });

  it("rejects unknown programme ids without changing settings", async () => {
    setSettings({ programme_id: "generic-uk-phd" });
    const rejected = await putSettingsRoute(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programme_id: "retired-programme" }),
      }),
    );
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain("Unknown programme");
    expect(getSettings().programme_id).toBe("generic-uk-phd");

    const accepted = await putSettingsRoute(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programme_id: "us-phd" }),
      }),
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).programme_id).toBe("us-phd");

    const freshInstallSave = await putSettingsRoute(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programme_id: "", default_provider: "codex" }),
      }),
    );
    expect(freshInstallSave.status).toBe(200);
    expect(await freshInstallSave.json()).toMatchObject({
      programme_id: "",
      default_provider: "codex",
    });
    setSettings({ programme_id: "generic-uk-phd" });
  });
});
