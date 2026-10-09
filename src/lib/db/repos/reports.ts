import { getDb, newId, nowIso } from "../client";

export type ReportType = "viva_assessment" | "doc_review" | "rebuttal_letter";

export interface ReportRow {
  id: string;
  session_id: string | null;
  document_id: string | null;
  type: ReportType;
  verdict: string | null;
  rubric_json: string | null;
  content_md: string;
  created_at: string;
}

export type ReportSummary = Omit<ReportRow, "rubric_json" | "content_md"> & {
  // rubric_json.$.format ("peer_review", "imported_review"), so lists can
  // label a report without downloading its body.
  format: string | null;
};

interface ReportFilter {
  programmeId?: string;
  stageId?: string;
  sessionId?: string;
  documentId?: string;
  type?: ReportType;
}

export function insertReport(r: {
  sessionId?: string | null;
  documentId?: string | null;
  type: ReportType;
  verdict?: string | null;
  rubric?: unknown;
  contentMd: string;
}): ReportRow {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO reports (id, session_id, document_id, type, verdict, rubric_json, content_md, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      r.sessionId ?? null,
      r.documentId ?? null,
      r.type,
      r.verdict ?? null,
      r.rubric === undefined ? null : JSON.stringify(r.rubric),
      r.contentMd,
      nowIso(),
    );
  return getReport(id)!;
}

export function getReport(id: string): ReportRow | null {
  return (getDb().prepare("SELECT * FROM reports WHERE id = ?").get(id) ??
    null) as ReportRow | null;
}

function reportFilter(filter?: ReportFilter): { where: string; values: string[] } {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filter?.programmeId && filter?.stageId) {
    clauses.push(
      "((d.programme_id = ? AND d.stage_id = ?) OR (s.programme_id = ? AND s.stage_id = ?))",
    );
    values.push(filter.programmeId, filter.stageId, filter.programmeId, filter.stageId);
  } else if (filter?.programmeId) {
    clauses.push("(d.programme_id = ? OR s.programme_id = ?)");
    values.push(filter.programmeId, filter.programmeId);
  } else if (filter?.stageId) {
    clauses.push("(d.stage_id = ? OR s.stage_id = ?)");
    values.push(filter.stageId, filter.stageId);
  }
  if (filter?.sessionId) {
    clauses.push("r.session_id = ?");
    values.push(filter.sessionId);
  }
  if (filter?.documentId) {
    clauses.push("r.document_id = ?");
    values.push(filter.documentId);
  }
  if (filter?.type) {
    clauses.push("r.type = ?");
    values.push(filter.type);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, values };
}

export function listReports(filter?: ReportFilter): ReportRow[] {
  const { where, values } = reportFilter(filter);
  return getDb()
    .prepare(
      `SELECT r.*
       FROM reports r
       LEFT JOIN documents d ON d.id = r.document_id
       LEFT JOIN sessions s ON s.id = r.session_id
       ${where}
       ORDER BY r.created_at DESC, r.rowid DESC`,
    )
    .all(...values) as unknown as ReportRow[];
}

/** Body-free rows for list screens; full report content stays on the detail route. */
export function listReportSummaries(filter?: ReportFilter): ReportSummary[] {
  const { where, values } = reportFilter(filter);
  return getDb()
    .prepare(
      `SELECT r.id, r.session_id, r.document_id, r.type, r.verdict, r.created_at,
              CASE WHEN json_valid(r.rubric_json) THEN json_extract(r.rubric_json, '$.format') END AS format
       FROM reports r
       LEFT JOIN documents d ON d.id = r.document_id
       LEFT JOIN sessions s ON s.id = r.session_id
       ${where}
       ORDER BY r.created_at DESC, r.rowid DESC`,
    )
    .all(...values) as unknown as ReportSummary[];
}

// For user-edited reports (e.g. rebuttal letters polished before sending).
export function updateReportContent(id: string, contentMd: string): ReportRow | null {
  getDb().prepare("UPDATE reports SET content_md = ? WHERE id = ?").run(contentMd, id);
  return getReport(id);
}
