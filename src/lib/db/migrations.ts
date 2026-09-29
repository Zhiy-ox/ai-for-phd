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
  // v2 — weakness ledger: weak spots harvested from assessments and reviews,
  // carried across sessions until resolved.
  `
  CREATE TABLE findings (
    id           TEXT PRIMARY KEY,
    stage_id     TEXT NOT NULL,
    criterion_id TEXT,
    description  TEXT NOT NULL,
    evidence     TEXT,
    source_type  TEXT NOT NULL,
    source_id    TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE INDEX idx_findings_stage ON findings(stage_id, status);
  `,
  // v3 — add programme_id to findings table, default to 'oxford-dphil' for backward compatibility
  `
  ALTER TABLE findings ADD COLUMN programme_id TEXT;
  UPDATE findings SET programme_id = 'oxford-dphil' WHERE programme_id IS NULL;
  DROP INDEX IF EXISTS idx_findings_stage;
  CREATE INDEX idx_findings_programme_stage ON findings(programme_id, stage_id, status);
  `,
  // v4 — user-editable session titles (rename affordance; null = derived label)
  `
  ALTER TABLE sessions ADD COLUMN title TEXT;
  `,
  // v5 — programme ownership for user-created documents and sessions. Session
  // configs already carried programmeId, so preserve registered ids where
  // present; invalid/retired ids and config-less rows fall back to the valid
  // selected programme, then the built-in default. A document takes the
  // programme of the earliest session that examined it, so switching
  // programmes before upgrading cannot orphan a document from its sessions.
  `
  ALTER TABLE documents ADD COLUMN programme_id TEXT;
  ALTER TABLE sessions ADD COLUMN programme_id TEXT;

  UPDATE documents
  SET programme_id = COALESCE(
    (
      SELECT TRIM(json_extract(s.config_json, '$.programmeId'))
      FROM sessions s
      WHERE json_valid(s.config_json)
        AND json_type(s.config_json, '$.programmeId') = 'text'
        AND TRIM(json_extract(s.config_json, '$.programmeId'))
          IN ('oxford-dphil', 'generic-uk-phd', 'us-phd')
        AND EXISTS (
          SELECT 1
          FROM json_each(
            CASE WHEN json_valid(s.config_json) THEN s.config_json ELSE '{}' END,
            '$.documentIds'
          ) j
          WHERE j.value = documents.id
        )
      ORDER BY s.created_at ASC
      LIMIT 1
    ),
    CASE
      WHEN TRIM(COALESCE(
        (SELECT value FROM settings WHERE key = 'programme_id'),
        ''
      )) IN ('oxford-dphil', 'generic-uk-phd', 'us-phd')
      THEN TRIM((SELECT value FROM settings WHERE key = 'programme_id'))
    END,
    'oxford-dphil'
  )
  WHERE programme_id IS NULL;

  UPDATE sessions
  SET programme_id = COALESCE(
    CASE
      WHEN json_valid(config_json) THEN CASE
        WHEN json_type(config_json, '$.programmeId') = 'text'
          AND TRIM(json_extract(config_json, '$.programmeId'))
            IN ('oxford-dphil', 'generic-uk-phd', 'us-phd')
        THEN TRIM(json_extract(config_json, '$.programmeId'))
      END
    END,
    CASE
      WHEN TRIM(COALESCE(
        (SELECT value FROM settings WHERE key = 'programme_id'),
        ''
      )) IN ('oxford-dphil', 'generic-uk-phd', 'us-phd')
      THEN TRIM((SELECT value FROM settings WHERE key = 'programme_id'))
    END,
    'oxford-dphil'
  )
  WHERE programme_id IS NULL;

  CREATE INDEX idx_documents_programme_stage
    ON documents(programme_id, stage_id, created_at DESC);
  CREATE INDEX idx_sessions_programme_stage
    ON sessions(programme_id, stage_id, status, created_at DESC);
  `,
];
