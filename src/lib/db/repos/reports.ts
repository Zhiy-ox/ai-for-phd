import { getDb, newId, nowIso } from "../client";

export type ReportType = "viva_assessment" | "doc_review";

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

export function listReports(filter?: {
  sessionId?: string;
  documentId?: string;
  type?: ReportType;
}): ReportRow[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filter?.sessionId) {
    clauses.push("session_id = ?");
    values.push(filter.sessionId);
  }
  if (filter?.documentId) {
    clauses.push("document_id = ?");
    values.push(filter.documentId);
  }
  if (filter?.type) {
    clauses.push("type = ?");
    values.push(filter.type);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC`)
    .all(...values) as unknown as ReportRow[];
}
