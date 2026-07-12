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
│   │   └── repos/        # stage-instances, documents, sessions, reports, settings, findings
│   ├── providers/
│   │   ├── types.ts      # LLMProvider contract: streamTurn/completeOnce/checkAuth, ProviderEvent
│   │   ├── claude.ts     # @anthropic-ai/claude-agent-sdk adapter (tools disabled, resume, replay fallback)
│   │   ├── codex.ts      # @openai/codex-sdk adapter (threads, read-only sandbox)
│   │   ├── registry.ts   # getProvider / resolveProviderAndModel (settings defaults)
│   │   ├── binaries.ts   # auto-detect claude/codex on PATH + common dirs (env vars override)
│   │   └── auth-status.ts# `claude auth status` / `codex login status`, 5-min cache
│   ├── viva/             # engine.ts (session loop), prompts.ts (panel/assessment), planner.ts, report.ts, types.ts
│   ├── review/           # one-shot rubric doc review + score-delta history selection
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
| Tests | ✅ | 76 vitest tests: extraction (fixtures incl. hand-built PDF), provider event mapping, JSON parse/retry, template validation, findings, score-delta selection |

---

## 4. SHIPPED — Phase B: Weakness ledger (cross-session memory)

**Goal:** the app remembers your weak spots across sessions. Panels open by
re-attacking them; good answers resolve them; document re-reviews show score
deltas. This is the product's moat — prioritize it.

**Status: tasks 1–9 ✅ shipped (Claude + Codex, 2026-07-11). Phase B is
complete.**

```sql
findings(id, stage_id, criterion_id, description, evidence,
         source_type, source_id, status DEFAULT 'open', created_at, updated_at)
-- status: open | improving | resolved   source_type: viva_assessment | doc_review
```

**Task log:**

1. ✅ **Repo** — `src/lib/db/repos/findings.ts`: `insertFinding` (dedups
   against unresolved same-stage case-insensitive descriptions; returns
   `null` when skipped; rejects blank descriptions), `listFindings({stageId?,
   status?, unresolved?})`, `updateFindingStatus`, `getFinding`.
2. ✅ **Harvest — assessments** — `src/lib/viva/report.ts` inserts each
   `weaknesses[]` item after a successful assessment
   (`source_type='viva_assessment'`, `source_id=report.id`).
3. ✅ **Harvest — reviews** — `src/lib/review/run.ts` inserts each
   major/moderate section (`description=comment`, `evidence=anchor_quote`).
4. ✅ **Re-attack** — `engine.ts` passes unresolved findings into
   `buildPanelSystemPrompt` (`standingWeaknesses` arg); prompt block
   instructs the panel to re-test naturally, never announcing the list.
5. ✅ **Auto-resolution** — `buildAssessmentPrompt` takes
   `standingWeaknesses` (with ids) and asks for `weakness_updates`
   (`resolved|improving|still_open`); `VivaAssessment` type + zod schema
   extended (optional, backward-compatible); `report.ts` applies updates
   (only ids that were offered to the model are trusted; `still_open`→`open`).
6. ✅ **API** — `GET /api/findings?stageId=&status=&unresolved=1`,
   `PATCH /api/findings/[id]` `{status}`.
7. ✅ **UI** — dashboard current-stage panel shows an amber "Open weaknesses
   (n) — the panel remembers" strip (top 3, dot green when `improving`,
   links to `?tab=reports`); stage Reports tab opens with a **Weakness
   ledger** section (evidence quotes, status chip, Resolve button).
8. ✅ **Score deltas** — `src/app/reports/[id]/page.tsx` fetches the current
   document, stage documents, and review history; compares against the most
   recent strictly older review of the same `(stage_id, kind)`; and renders
   accessible green/red score chips plus the prior review date. Selection is
   isolated in `src/lib/review/score-deltas.ts` and covered by five tests; no
   schema or API changes.
9. ✅ **Tests** — `tests/findings.test.ts` (7 tests, temp `DATA_DIR` set
   before importing the db client): dedup, filters, status transitions,
   re-raise after resolution, blank rejection, extended schema parse.
   Suite total after tasks 8–9: 76.

**Notes for the next agent:** migration v2 applies lazily on first DB open —
no manual step. Findings are keyed to `stage_id` only (not programme), which
is correct while a user runs one programme; revisit if multi-programme
concurrency ever matters. A synthetic live acceptance run with Codex
(2026-07-11) verified validated assessment JSON, `weakness_updates` resolving
a standing item, new-weakness harvesting, and the score-delta UI at 1280,
640, and 390 px. The full streamed panel loop has not yet been exercised live;
on the next real mock viva, confirm that the opening turns naturally re-attack
standing weaknesses.

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
  && npx vitest run && npm run build` — all must be clean. 76+ tests stay
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
