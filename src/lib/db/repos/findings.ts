// Weakness ledger: weak spots harvested from viva assessments and document
// reviews, carried across sessions until resolved. See docs/BUILD_PLAN.md §4.
import { getDb, newId, nowIso } from "../client";
import { getSettings } from "./settings";
import { DEFAULT_PROGRAMME_ID } from "@/lib/template";

export type FindingStatus = "open" | "improving" | "resolved";
export type FindingSource = "viva_assessment" | "doc_review";

export interface FindingRow {
  id: string;
  programme_id: string;
  stage_id: string;
  criterion_id: string | null;
  description: string;
  evidence: string | null;
  source_type: FindingSource;
  source_id: string | null;
  status: FindingStatus;
  created_at: string;
  updated_at: string;
}

// Inserts a finding unless an unresolved one with the same programme, stage, and
// (case-insensitive) description already exists — assessments often restate
// the same weakness. Returns null when deduplicated away.
export function insertFinding(f: {
  programmeId?: string;
  stageId: string;
  criterionId?: string | null;
  description: string;
  evidence?: string | null;
  sourceType: FindingSource;
  sourceId?: string | null;
}): FindingRow | null {
  const db = getDb();
  const description = f.description.trim();
  if (!description) return null;

  const programmeId = f.programmeId || getSettings().programme_id || DEFAULT_PROGRAMME_ID;

  const existing = db
    .prepare(
      `SELECT id FROM findings
       WHERE programme_id = ? AND stage_id = ? AND status != 'resolved' AND lower(description) = lower(?)`,
    )
    .get(programmeId, f.stageId, description) as { id: string } | undefined;
  if (existing) return null;

  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO findings (id, programme_id, stage_id, criterion_id, description, evidence,
                           source_type, source_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).run(
    id,
    programmeId,
    f.stageId,
    f.criterionId ?? null,
    description,
    f.evidence ?? null,
    f.sourceType,
    f.sourceId ?? null,
    now,
    now,
  );
  return getFinding(id);
}

export function getFinding(id: string): FindingRow | null {
  return (getDb().prepare("SELECT * FROM findings WHERE id = ?").get(id) ??
    null) as FindingRow | null;
}

export function listFindings(filter?: {
  programmeId?: string;
  stageId?: string;
  status?: FindingStatus;
  // Convenience: open + improving (what a panel should re-attack).
  unresolved?: boolean;
}): FindingRow[] {
  const clauses: string[] = [];
  const values: string[] = [];

  const programmeId = filter?.programmeId || getSettings().programme_id || DEFAULT_PROGRAMME_ID;
  clauses.push("programme_id = ?");
  values.push(programmeId);

  if (filter?.stageId) {
    clauses.push("stage_id = ?");
    values.push(filter.stageId);
  }
  if (filter?.status) {
    clauses.push("status = ?");
    values.push(filter.status);
  } else if (filter?.unresolved) {
    clauses.push("status != 'resolved'");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM findings ${where} ORDER BY created_at DESC`)
    .all(...values) as unknown as FindingRow[];
}

export function updateFindingStatus(id: string, status: FindingStatus): FindingRow | null {
  getDb()
    .prepare("UPDATE findings SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowIso(), id);
  return getFinding(id);
}
