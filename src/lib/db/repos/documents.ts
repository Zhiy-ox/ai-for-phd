import { getDb, newId, nowIso } from "../client";

export type DocumentKind =
  | "transfer_report"
  | "confirmation_report"
  | "proposal"
  | "paper"
  | "referee_reports"
  | "other";

export interface DocumentRow {
  id: string;
  filename: string;
  kind: DocumentKind;
  stage_id: string | null;
  file_path: string;
  extracted_text: string | null;
  extract_error: string | null;
  char_count: number | null;
  created_at: string;
  updated_at: string;
}

// Listing variant without the (potentially huge) extracted text.
export type DocumentSummary = Omit<DocumentRow, "extracted_text"> & {
  has_text: boolean;
};

export function insertDocument(doc: {
  filename: string;
  kind: DocumentKind;
  stageId?: string | null;
  filePath: string;
}): DocumentRow {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO documents (id, filename, kind, stage_id, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, doc.filename, doc.kind, doc.stageId ?? null, doc.filePath, now, now);
  return getDocument(id)!;
}

export function getDocument(id: string): DocumentRow | null {
  return (getDb().prepare("SELECT * FROM documents WHERE id = ?").get(id) ??
    null) as DocumentRow | null;
}

export function listDocuments(filter?: {
  stageId?: string;
  kind?: DocumentKind;
}): DocumentSummary[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filter?.stageId) {
    clauses.push("stage_id = ?");
    values.push(filter.stageId);
  }
  if (filter?.kind) {
    clauses.push("kind = ?");
    values.push(filter.kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT id, filename, kind, stage_id, file_path,
              extracted_text IS NOT NULL AS has_text,
              extract_error, char_count, created_at, updated_at
       FROM documents ${where} ORDER BY created_at DESC`,
    )
    .all(...values) as unknown as (Omit<DocumentSummary, "has_text"> & { has_text: 0 | 1 })[];
  return rows.map((r) => ({ ...r, has_text: !!r.has_text }));
}

export function updateExtraction(
  id: string,
  result: { text?: string | null; error?: string | null; charCount?: number | null },
): void {
  getDb()
    .prepare(
      `UPDATE documents
       SET extracted_text = ?, extract_error = ?, char_count = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(result.text ?? null, result.error ?? null, result.charCount ?? null, nowIso(), id);
}

export function updateDocumentMeta(
  id: string,
  patch: { kind?: DocumentKind; stageId?: string | null },
): DocumentRow | null {
  const db = getDb();
  const sets: string[] = ["updated_at = ?"];
  const values: (string | null)[] = [nowIso()];
  if (patch.kind !== undefined) {
    sets.push("kind = ?");
    values.push(patch.kind);
  }
  if (patch.stageId !== undefined) {
    sets.push("stage_id = ?");
    values.push(patch.stageId);
  }
  db.prepare(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  return getDocument(id);
}

export function deleteDocument(id: string): void {
  getDb().prepare("DELETE FROM documents WHERE id = ?").run(id);
}
