# AI for PhD — Build Plan & Agent Handbook

> **Purpose of this file.** Single source of truth for every agent (Claude
> Code, Codex) and human working on this repo: what the product is, what has
> been built, what is in flight, what comes next, and the working agreements.
> **Read this before writing code. Update it when you ship or re-scope
> anything.** Last updated: 2026-07-11.

---

## 1. Product in one paragraph

**"Your doctorate, rehearsed before it's real."** A local-first web app that
structures a PhD as a journey of formal gates (transfer/upgrade viva,
confirmation, papers & rebuttals, thesis, final defence) and uses AI to play
the institutional counterpart: assessor panels that grill you in mock vivas,
Reviewer 2 attacking your manuscript, rubric-scored document feedback with
GSO-style verdict reports. **No API keys, no cloud**: the AI runs through the
locally installed Claude Code and/or Codex CLIs on the user's own
subscriptions; all data stays in `data/` on the user's machine.

### Resolved product decisions (do not re-litigate without the owner)

| Decision | Choice |
|---|---|
| Direction | Public product, not just a personal tool |
| Distribution | Local-first distributable app (git clone + npm), BYO Claude/ChatGPT subscription |
| Licence | Open source, MIT, public repo: `github.com/Zhiy-ox/ai-for-phd` |
| Programme generality | 3 curated presets (Oxford DPhil, generic UK PhD, US PhD); **no** in-app template editor — templates are hand-editable data files |
| LLM access | Subscription-auth CLIs only; **never introduce API-key requirements** into the core app |
| Lead features (owner-picked) | ① Weakness ledger (cross-session memory) ② Rebuttal-letter drafter ③ Examiner styles *(shipped)* |
| Owner | Zhiyu Xu (`Zhiy-ox`), LC-photonics PhD student, pre-transfer, Oxford-style programme |

---

## 2. Architecture map

**Stack:** Next.js 16 (App Router, TS, Tailwind v4), Node ≥ 22.13,
`node:sqlite` (no ORM, no native deps), zod for validation, react-markdown.
Fonts: Geist (sans) + Newsreader (display serif). Tests: vitest.

**Data flow:** client pages (`"use client"`, fetch on mount) → API route
handlers (`src/app/api/**`, Node runtime, zod-validated) → repos (prepared
statements over SQLite) + engine/review libs → `LLMProvider` adapters that
spawn the local CLIs. Streaming = SSE over POST fetch.

```
src/
├── templates/            # PROGRAMME DATA: oxford-dphil.ts, generic-uk-phd.ts, us-phd.ts
├── lib/
│   ├── template.ts       # zod schema, registry, getProgramme/getStage/findStage/getSessionStyle
│   ├── programme.ts      # getActiveProgramme() — reads settings.programme_id (server only)
│   ├── db/
│   │   ├── client.ts     # node:sqlite singleton, dataDir/documentsDir/scratchDir
│   │   ├── migrations.ts # append-only array, PRAGMA user_version (v1 core, v2 findings)
│   │   └── repos/        # stage-instances, documents, sessions, reports, settings (+ findings: TODO)
│   ├── providers/
│   │   ├── types.ts      # LLMProvider contract: streamTurn/completeOnce/checkAuth, ProviderEvent
│   │   ├── claude.ts     # @anthropic-ai/claude-agent-sdk adapter (tools disabled, resume, replay fallback)
│   │   ├── codex.ts      # @openai/codex-sdk adapter (threads, read-only sandbox)
│   │   ├── registry.ts   # getProvider / resolveProviderAndModel (settings defaults)
│   │   ├── binaries.ts   # auto-detect claude/codex on PATH + common dirs (env vars override)
│   │   └── auth-status.ts# `claude auth status` / `codex login status`, 5-min cache
│   ├── viva/             # engine.ts (session loop), prompts.ts (panel/assessment), planner.ts, report.ts, types.ts
│   ├── review/           # run.ts + prompts.ts — one-shot rubric doc review (anchored findings)
│   ├── extraction/       # pdf (unpdf), docx (mammoth), plain text
│   ├── shared/json-extract.ts # completeJsonWithRetry — fenced-JSON + one re-emit retry
│   └── sse.ts            # AsyncGenerator → text/event-stream Response
├── app/                  # pages: / (dashboard), /welcome (wizard), /stages/[stageId] (?tab=),
│   │                     #   /documents(+/[id]), /sessions(+/[id] dark viva room), /reports/[id], /settings
│   └── api/              # programme(+current-stage), stages/[stageId], documents(+[id]/text|review),
│                         #   sessions(+[id]/turns SSE|end), reports, providers/status, settings
└── components/           # api.ts (fetch helpers/labels), ui.tsx, app-shell (masthead),
                          #   provider-picker, upload-dropzone, use-sse-stream, use-speech, status-chip, markdown
```

**Key invariants**
- Programme structure is **data**: stages/rubrics/personas/verdicts live in
  `src/templates/*.ts`, zod-validated at import. Shared stage ids across
  templates (`papers`, `thesis`, `final-viva`, `corrections`) keep
  `STAGE_PRIMARY_KIND` and UI defaults working.
- Stages with `assessment` get an interview tab; review-only stages use
  `reviewRubric`. Per-stage `assessment.session` styles the exercise
  (label/brief/opening/reportTitle).
- Providers must **never** gain filesystem/tool access (Claude:
  `allowedTools: []`, empty scratch cwd; Codex: read-only sandbox).
- `streamTurn` never throws — errors become `ProviderEvent{type:"error"}`
  with codes (`not_logged_in`, `usage_limit`, `session_expired`, …); every
  turn is persisted so transcript-replay can rebuild a dead provider session.
- Migrations are **append-only**; never edit a shipped entry.
- All model JSON outputs go through `completeJsonWithRetry` with a zod schema.

---

## 3. What has been built (shipped, on `main`)

| Area | Status | Notes |
|---|---|---|
| 7-stage Oxford DPhil journey | ✅ | 4 panel stages (Transfer, Confirmation, Papers/Rebuttal, Final Viva) + 3 review-only (PRS, Thesis, Corrections) |
| Mock viva engine | ✅ | question planner → 2-persona panel prompt → streamed turns with follow-up pressure → `<viva-complete/>` detection → GSO-style assessment report (verdict + rubric scores) |
| Rubric document review | ✅ | anchored verbatim quotes, severity-graded findings, top actions |
| Dual subscription backends | ✅ | Claude Code + Codex, switchable per session, live auth status, CLI auto-detect (no .env.local) |
| Voice viva | ✅ | Web Speech API STT (push-to-talk → editable transcript → send) + read-aloud TTS toggle |
| Redesigned UI | ✅ | cream/royal-blue design system, Newsreader serif, masthead, milestone rail + gate-seal dashboard, dark viva room (from the owner's Claude Design spec) |
| Current-stage dashboard | ✅ | next-move nudge, docs/sessions/reports summaries, "Where are you?" (POST `/api/programme/current-stage`) |
| Programme presets + wizard | ✅ | oxford-dphil / generic-uk-phd / us-phd; `/welcome` first-run wizard; `settings.programme_id`; Settings programme card |
| Examiner styles | ✅ | `PanelStyle` (supportive/standard/hostile + focus) → planner & panel prompts; picker in session setup |
| Open-source release | ✅ | MIT LICENSE, product README, repo public with topics |
| Tests | ✅ | 64 vitest tests: extraction (fixtures incl. hand-built PDF), provider event mapping, JSON parse/retry, template validation via import |

---

## 4. IN FLIGHT — Phase B: Weakness ledger (cross-session memory)

**Goal:** the app remembers your weak spots across sessions. Panels open by
re-attacking them; good answers resolve them; document re-reviews show score
deltas. This is the product's moat — prioritize it.

**Current state: migration shipped, nothing else.**
`src/lib/db/migrations.ts` v2 already creates:

```sql
findings(id, stage_id, criterion_id, description, evidence,
         source_type, source_id, status DEFAULT 'open', created_at, updated_at)
-- status: open | improving | resolved   source_type: viva_assessment | doc_review
```

**Remaining tasks (in order):**

1. **Repo** `src/lib/db/repos/findings.ts`: `insertFinding` (skip when an
   open finding with same `stage_id` + case-insensitive `description`
   exists), `listFindings({stageId?, status?})`, `updateFindingStatus(id,
   status)`.
2. **Harvest — assessments** (`src/lib/viva/report.ts`): after a successful
   assessment, insert each `weaknesses[]` item (stage from `VivaConfig`,
   `source_type='viva_assessment'`, `source_id=report.id`,
   `criterion_id=null`).
3. **Harvest — reviews** (`src/lib/review/run.ts`): insert each
   `major`/`moderate` section (`description=comment`,
   `evidence=anchor_quote`, `source_type='doc_review'`).
4. **Re-attack** (`src/lib/viva/engine.ts` + `prompts.ts`): load
   open+improving findings for the stage; pass to `buildPanelSystemPrompt`
   as `standingWeaknesses`; new prompt block: "standing weaknesses from
   previous sessions — probe each at a natural moment; note where the
   candidate has clearly improved".
5. **Auto-resolution** (`prompts.ts` assessment prompt + `report.ts`): when
   standing weaknesses were provided, assessment JSON gains optional
   `weakness_updates: [{id, status: "resolved"|"improving"|"still_open"}]`
   (extend `VivaAssessment` type + schema, both optional/backward-compatible);
   apply via `updateFindingStatus`.
6. **API**: `GET /api/findings?stageId=&status=` and
   `PATCH /api/findings/[id]` (body `{status}`) — same conventions as other
   routes (zod, force-dynamic, `{error}` bodies).
7. **UI**: (a) dashboard current-stage panel gains an "Open weaknesses (n)"
   list (top 3, link to stage) — `src/app/page.tsx`; (b) stage page Reports
   tab gains a Weaknesses section with resolve/reopen buttons —
   `src/app/stages/[stageId]/page.tsx`.
8. **Score deltas** (`src/app/reports/[id]/page.tsx`): for a `doc_review`
   report, find the previous `doc_review` whose document shares
   (stage_id, kind); render ▲/▼ per-criterion deltas next to scores.
   Client-side compute; no schema change.
9. **Tests**: findings repo dedup/status transitions (in-memory DB via
   `DATA_DIR` env to a temp dir), extended assessment schema parse.

---

## 5. Roadmap after Phase B

- **Phase C — Rebuttal-letter drafter.** From an ended `papers` sparring
  session + referee-report documents: one `completeOnce` → point-by-point
  response letter (referee quote → response → manuscript change w/ location),
  zod-validated, stored as a new report type `rebuttal_letter`, editable
  textarea view, export .md. Files: `src/lib/rebuttal/`, route
  `POST /api/sessions/[id]/rebuttal-letter`, button on ended papers sessions.
- **Phase D — backlog** (unordered): practice gym (timed quick-fire drills),
  supervisor-facing PDF export, guided 3-step stage stepper (design spec has
  it; tabs work today), deadline countdowns on the milestone rail, usage-window
  meter for Pro plans, `docs/` landing page for GitHub Pages, mobile pass.

---

## 6. Working agreements (both agents)

- **Verify before done:** `npx tsc --noEmit && npx eslint src scripts tests
  && npx vitest run && npm run build` — all must be clean. 64+ tests stay
  green; add tests for new pure logic.
- **Live checks:** `npm run dev` (port 3000). The owner often runs his own
  server on 3000 — check before killing anything, and stop servers you
  started when done. Real LLM calls spend the owner's subscription quota
  (Claude Pro has tight 5-hour windows): keep smoke tests to one short call,
  prefer Codex for long live tests.
- **Style:** 2-space indent, double quotes, match neighbouring code. React:
  no render-time ref writes, no synchronous setState in effects (lint
  enforces; use lazy initializers / effect-synced refs). Comments only for
  non-obvious constraints.
- **Don't touch:** `data/` (user's research), `.env.local`, shipped
  migration entries, the provider tool-lockdown settings.
- **Commits:** conventional-ish (`feat:`, `fix:`, `docs:`), imperative body
  bullets; push to `origin main`. Repo is PUBLIC — never commit real
  research documents, tokens, or personal data; fixtures must be synthetic.
- **Coordination:** claim a task by updating §4/§5 here (mark `⏳ <agent>`)
  in the same PR/commit as your work; mark ✅ when shipped. If two agents
  work in parallel, split by file ownership (e.g. one takes lib+API, the
  other takes UI) and rebase early.
