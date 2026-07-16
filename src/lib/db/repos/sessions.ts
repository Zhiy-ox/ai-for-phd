import { getDb, newId, nowIso } from "../client";
import type { ProviderId } from "@/lib/providers/types";

export type SessionType = "viva" | "doc_review";
export type SessionStatus = "active" | "ended" | "errored";

export interface SessionRow {
  id: string;
  type: SessionType;
  stage_id: string;
  provider: ProviderId;
  provider_session_ref: string | null;
  status: SessionStatus;
  config_json: string;
  title: string | null;
  created_at: string;
  ended_at: string | null;
}

export type MessageRole = "user" | "panel";

export interface MessageRow {
  id: string;
  session_id: string;
  seq: number;
  role: MessageRole;
  speaker: string | null;
  content: string;
  created_at: string;
}

export function createSession(s: {
  type: SessionType;
  stageId: string;
  provider: ProviderId;
  config: unknown;
}): SessionRow {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, type, stage_id, provider, config_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, s.type, s.stageId, s.provider, JSON.stringify(s.config ?? {}), nowIso());
  return getSession(id)!;
}

export function getSession(id: string): SessionRow | null {
  return (getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) ??
    null) as SessionRow | null;
}

export function listSessions(filter?: {
  type?: SessionType;
  stageId?: string;
}): SessionRow[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filter?.type) {
    clauses.push("type = ?");
    values.push(filter.type);
  }
  if (filter?.stageId) {
    clauses.push("stage_id = ?");
    values.push(filter.stageId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM sessions ${where} ORDER BY created_at DESC`)
    .all(...values) as unknown as SessionRow[];
}

export function setProviderSessionRef(id: string, ref: string | null): void {
  getDb().prepare("UPDATE sessions SET provider_session_ref = ? WHERE id = ?").run(ref, id);
}

export function setSessionConfig(id: string, config: unknown): void {
  getDb()
    .prepare("UPDATE sessions SET config_json = ? WHERE id = ?")
    .run(JSON.stringify(config ?? {}), id);
}

export function endSession(id: string, status: Exclude<SessionStatus, "active"> = "ended"): void {
  getDb()
    .prepare("UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?")
    .run(status, nowIso(), id);
}

export function renameSession(id: string, title: string | null): void {
  const clean = title?.trim() || null;
  getDb().prepare("UPDATE sessions SET title = ? WHERE id = ?").run(clean, id);
}

/** Deletes a session with its transcript and reports. Ledger findings the
 *  session produced are knowledge, not artifacts — they stay. */
export function deleteSession(id: string): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM reports WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function appendMessage(m: {
  sessionId: string;
  role: MessageRole;
  speaker?: string | null;
  content: string;
}): MessageRow {
  const db = getDb();
  const id = newId();
  const next = db
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE session_id = ?")
    .get(m.sessionId) as { seq: number };
  db.prepare(
    `INSERT INTO messages (id, session_id, seq, role, speaker, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, m.sessionId, next.seq, m.role, m.speaker ?? null, m.content, nowIso());
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as MessageRow;
}

export function listMessages(sessionId: string): MessageRow[] {
  return getDb()
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC")
    .all(sessionId) as unknown as MessageRow[];
}
