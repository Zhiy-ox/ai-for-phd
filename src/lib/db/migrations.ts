// Ordered migrations applied via PRAGMA user_version. Never edit a shipped
// migration — append a new one.
export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE stage_instances (
    programme_id TEXT NOT NULL,
    stage_id     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'upcoming',
    target_date  TEXT,
    notes        TEXT,
    PRIMARY KEY (programme_id, stage_id)
  );

  CREATE TABLE documents (
    id             TEXT PRIMARY KEY,
    filename       TEXT NOT NULL,
    kind           TEXT NOT NULL,
    stage_id       TEXT,
    file_path      TEXT NOT NULL,
    extracted_text TEXT,
    extract_error  TEXT,
    char_count     INTEGER,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id                   TEXT PRIMARY KEY,
    type                 TEXT NOT NULL,
    stage_id             TEXT NOT NULL,
    provider             TEXT NOT NULL,
    provider_session_ref TEXT,
    status               TEXT NOT NULL DEFAULT 'active',
    config_json          TEXT NOT NULL DEFAULT '{}',
    created_at           TEXT NOT NULL,
    ended_at             TEXT
  );

  CREATE TABLE messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    seq        INTEGER NOT NULL,
    role       TEXT NOT NULL,
    speaker    TEXT,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_messages_session_seq ON messages(session_id, seq);

  CREATE TABLE reports (
    id          TEXT PRIMARY KEY,
    session_id  TEXT REFERENCES sessions(id),
    document_id TEXT REFERENCES documents(id),
    type        TEXT NOT NULL,
    verdict     TEXT,
    rubric_json TEXT,
    content_md  TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
