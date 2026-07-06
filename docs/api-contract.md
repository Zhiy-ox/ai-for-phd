# API contract (v1)

All routes are Node-runtime App Router route handlers under `src/app/api/`.
JSON in/out unless noted. Errors: non-2xx with `{ "error": string }`.
Types referenced below live in `src/lib/**` — import them, do not redeclare.

## Programme & stages

### GET /api/programme
`{ programme: ProgrammeTemplate, instances: StageInstance[] }`
Uses `getProgramme(DEFAULT_PROGRAMME_ID)`; calls `ensureSeeded()` before listing.

### PATCH /api/stages/[stageId]
Body: `{ status?, targetDate?, notes? }` → `{ instance: StageInstance }`

## Documents

### GET /api/documents?stageId=&kind=
`{ documents: DocumentSummary[] }` (never includes extracted_text)

### POST /api/documents  (multipart/form-data)
Fields: `file` (File, required), `kind` (DocumentKind, default "other"), `stageId` (optional).
Saves to `documentsDir/<id><ext>`, inserts row, runs extraction inline
(extraction failure is NOT an HTTP error — stored in `extract_error`).
→ `{ document: DocumentRow }` (with extracted_text omitted, plus `has_text: boolean`)

### GET /api/documents/[id]
`{ document: DocumentRow }` (includes extracted_text)

### DELETE /api/documents/[id]
Deletes row + file. → `{ ok: true }`

### PATCH /api/documents/[id]
Body: `{ kind?, stageId? }` → `{ document: DocumentRow }` (no extracted_text)

### POST /api/documents/[id]/text
Manual-paste fallback. Body: `{ text: string }` → `{ ok: true }`
(Stores text, clears extract_error, sets char_count.)

### POST /api/documents/[id]/review
Body: `{ provider?: ProviderId, stageId?: string, model?: string }`
(defaults: settings.default_provider; document.stage_id or "transfer")
Runs `runDocReview` (one-shot; may take ~1 min). → `{ reportId: string }`

## Sessions (viva)

### GET /api/sessions?type=&stageId=
`{ sessions: SessionRow[] }`

### POST /api/sessions
Body: `{ stageId: string, provider?: ProviderId, documentIds: string[], model?: string }`
Creates viva session via `startVivaSession` (runs planner — slow-ish).
→ `{ session: SessionRow }`

### GET /api/sessions/[id]
`{ session: SessionRow, messages: MessageRow[], reports: ReportRow[] }`

### POST /api/sessions/[id]/turns   ← SSE
Body: `{ text: string }`. Empty `text` with no prior messages = begin viva.
Response: `text/event-stream` of `SessionEvent`s (see `src/lib/sse.ts` for
wire format): `panel_delta` → `panel_turn_complete`, possibly `viva_concluded`,
or `error`. Client must POST with `fetch` and read the body stream.

### POST /api/sessions/[id]/end
Generates the assessment report via `endViva`. → `{ reportId: string }`

## Reports

### GET /api/reports?documentId=&sessionId=&type=
`{ reports: ReportRow[] }`

### GET /api/reports/[id]
`{ report: ReportRow }` — for `doc_review`, `rubric_json` parses to
`DocReviewResult`; for `viva_assessment`, to `VivaAssessment`.

## Providers & settings

### GET /api/providers/status
`{ claude: AuthStatus, codex: AuthStatus }` (cached ~5 min server-side)

### GET /api/settings → `AppSettings`
### PUT /api/settings  Body: `Partial<AppSettings>` → `AppSettings`
