# AI for PhD — Build Plan & Agent Handbook

> **Purpose of this file.** Single source of truth for every agent (Claude
> Code, Codex) and human working on this repo: what the product is, what has
> been built, what is in flight, what comes next, and the working agreements.
> **Read this before writing code. Update it when you ship or re-scope
> anything.** Last updated: 2026-07-16 (written peer-review workflow shipped).

---

## 1. Product in one paragraph

**"Your doctorate, rehearsed before it's real."** A local-first web app that
structures a PhD as a journey of formal gates (transfer/upgrade viva,
confirmation, papers & rebuttals, thesis, final defence) and uses AI to play
the institutional counterpart: assessor panels that grill you in mock vivas,
three written reviewers returning journal-style manuscript comments (with
Reviewer 2 always the toughest), rubric-scored document feedback with GSO-style
verdict reports. **No API keys, no cloud**: the AI runs through the
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
Fonts: locally bundled Geist (sans) + Newsreader (display serif). Tests: vitest.

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
│   │   ├── migrations.ts # append-only array, PRAGMA user_version (v1–v5)
│   │   └── repos/        # stage-instances, documents, sessions, reports, settings, findings
│   ├── providers/
│   │   ├── types.ts      # LLMProvider contract: streamTurn/completeOnce/checkAuth, ProviderEvent
│   │   ├── claude.ts     # @anthropic-ai/claude-agent-sdk adapter (tools disabled, resume, replay fallback)
│   │   ├── codex.ts      # @openai/codex-sdk adapter (threads, read-only sandbox)
│   │   ├── registry.ts   # getProvider / resolveProviderAndModel (settings defaults)
│   │   ├── binaries.ts   # auto-detect claude/codex on PATH + common dirs (env vars override)
│   │   ├── auth-status.ts# `claude auth status` / `codex login status`, 5-min cache
│   │   └── usage*.ts     # failure-safe usage-window memory for streams + one-shots
│   ├── viva/             # engine.ts (session loop), prompts.ts (panel/assessment), planner.ts, report.ts, types.ts
│   ├── review/           # one-shot rubric doc review + score-delta history selection
│   ├── extraction/       # pdf (unpdf), docx (mammoth), plain text
│   ├── shared/json-extract.ts # completeJsonWithRetry — fenced-JSON + one re-emit retry
│   └── sse.ts            # AsyncGenerator → text/event-stream Response
├── app/                  # pages: / (dashboard), /welcome (wizard), /stages/[stageId] (?step=),
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
- `assessment.interaction` is the routing contract: `interview` stages get a
  live panel, while `written_peer_review` stages get an asynchronous written
  report. Stages without an assessment can use `reviewRubric`. Per-stage
  `assessment.session` styles live exercises only
  (label/brief/opening/reportTitle).
- Providers must **never** gain filesystem/tool access (Claude:
  `allowedTools: []`, empty scratch cwd; Codex: read-only sandbox).
- `streamTurn` never throws — errors become `ProviderEvent{type:"error"}`
  with codes (`not_logged_in`, `usage_limit`, `session_expired`, …); every
  turn is persisted so transcript-replay can rebuild a dead provider session.
- Migrations are **append-only**; never edit a shipped entry.
- All model JSON outputs go through `completeJsonWithUsageTracking` →
  `completeJsonWithRetry` with a zod schema; the shared JSON parser remains
  provider/DB-independent.

---

## 3. What has been built (shipped, on `main`)

| Area | Status | Notes |
|---|---|---|
| 7-stage Oxford DPhil journey | ✅ | 3 live panel stages (Transfer, Confirmation, Final Viva) + written three-referee Papers/Rebuttals + 3 review-only stages (PRS, Thesis, Corrections) |
| Mock viva engine | ✅ | question planner → 2-persona panel prompt → streamed turns with follow-up pressure → `<viva-complete/>` detection → GSO-style assessment report (verdict + rubric scores) |
| Rubric document review | ✅ | anchored verbatim quotes, severity-graded findings, top actions |
| Dual subscription backends | ✅ | Claude Code + Codex, switchable per session, live auth status, CLI auto-detect (no .env.local) |
| Voice viva | ✅ | Web Speech API STT (push-to-talk → editable transcript → send) + read-aloud TTS toggle |
| Redesigned UI | ✅ | cream/royal-blue design system, Newsreader serif, masthead, milestone rail + gate-seal dashboard, dark viva room (from the owner's Claude Design spec) |
| Current-stage dashboard | ✅ | compact programme-scoped activity, truthful next-move/readiness, "Where are you?" (POST `/api/programme/current-stage`) |
| Programme presets + wizard | ✅ | oxford-dphil / generic-uk-phd / us-phd; `/welcome` first-run wizard; `settings.programme_id`; Settings programme card |
| Examiner styles | ✅ | `PanelStyle` (supportive/standard/hostile + focus) → planner & panel prompts; picker in session setup |
| Open-source release | ✅ | MIT LICENSE, product README, repo public with topics |
| Motion & first-run guidance | ✅ | `anim-*` entrance utilities + celebration `Burst`/`TypingDots`/`AnimatedCheck` (ui.tsx), staggered page/tab/list transitions everywhere, weakness-resolve & pass-verdict celebrations, dashboard coach-mark tour (`coach-tour.tsx`) + guided empty states |
| Tests | ✅ | 132 vitest tests (incl. real-comment import): extraction, providers/quota memory, JSON parse/retry, templates, written peer review/rebuttal coverage (incl. failed-draft retry), findings/score deltas, programme boundaries, migration v5 backfill, stage activity |

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

- ✅ **Phase C — Rebuttal-letter drafter** (Claude, 2026-07-11; written-review
  flow revised by Codex, 2026-07-16). Originally drafted from an ended legacy
  `rebuttal_roleplay` session; the primary path now drafts directly from a
  structured written peer-review report:
  `src/lib/rebuttal/run.ts` contains `draftRebuttalLetterFromReview` plus the
  legacy transcript-backed `draftRebuttalLetter`; both validate through
  `RebuttalLetterSchema` and `renderRebuttalMarkdown`, stored as report type
  `rebuttal_letter`. `POST /api/reports/[id]/rebuttal-letter` covers every
  numbered Reviewer 1/2/3 point; the old session route remains for existing
  history. `PATCH /api/reports/[id]` saves user edits. The written-comments
  report exposes "Draft response letter", then the report page provides Save,
  Download .md, and live preview. NOT yet live-tested end-to-end (drafting
  spends quota) — the first real draft from written comments is the acceptance
  test.
- ✅ **Practice gym — quick-fire drills** (Claude, 2026-07-11). Session
  setup gains a mode toggle (full session / drill). Drills:
  `VivaConfig.mode="drill"`, no document required, planner skipped, lead
  persona alone asks 8 short questions with one-line verdict feedback,
  prioritizing open ledger weaknesses; 10-minute display-only countdown in
  the room; sessions list labels them. Assessments still run and adjudicate
  standing weaknesses. NOT live-tested (quota) — first real drill is the
  acceptance test.
- ✅ **UX motion & first-run guidance** (Claude, 2026-07-14; owner directive).
  (a) *Motion system*: keyframes (`popIn`, `typingDot`, `burstFly`,
  `drawCheck`, `sparkPulse`, `urgentPulse`) + reusable `.anim-rise/-sm`,
  `.anim-fade`, `.anim-pop` classes with a `--d` stagger var in
  `globals.css`; all animations honor `prefers-reduced-motion`. Applied as
  staggered entrances on dashboard/stage/sessions/welcome/report screens,
  keyed tab-switch transitions, hover-lift + press-scale on buttons and
  option cards. (b) *Delight*: `TypingDots` while the panel thinks (empty
  streamed bubble + settling-in state), `Burst` particle celebration on
  weakness Resolve (green flash → slide-out) and on passing verdict banners
  (`PASS_VERDICTS`; also fixed non-Oxford verdicts like `pass` rendering
  red), `AnimatedCheck` draw-in checkmarks for readiness, drill-countdown
  border throb in the final minute, milestone-rail spark pulse. (c) *First
  run*: `src/components/coach-tour.tsx` — spotlight coach-mark tour on the
  dashboard (`data-tour` targets; steps auto-skip when a target is absent;
  Esc/arrow keys; clamped `window.scrollTo`, NOT `scrollIntoView`, which
  overshoots), auto-opens once (`localStorage aiphd-tour-done`), replayable
  from the footer; `GuideSteps` numbered walkthroughs in the Reports-tab and
  Sessions empty states. Verified live: tour geometry, persistence, replay;
  stage tabs; review scorecard growBar.

- ✅ **Elegant stage record + castable panel** (Claude, 2026-07-16; owner
  directive). (a) StageHeader redesigned: the native status `<select>`
  became a segmented pill control (selected pill colored per status:
  active blue, passed green, referred brass), soft focus-ring inputs, and
  a Save button that fades in only when dirty ("Saved ✓" flash after).
  (b) Panel casting: `src/lib/viva/personalities.ts` defines six assessor
  archetypes (Methodologist, Field Strategist, Statistician, Theorist,
  Pragmatist, Literature Hawk); `PanelStyle.personas` maps template
  persona id → archetype id, validated in the sessions POST schema;
  `renderPersona` swaps style/focus while keeping name+role (unknown ids
  fall back to the template; covered by a prompt test). VivaTab panel
  cards gained per-assessor personality pills (description cross-fades on
  change) and "Press me especially on…" preset target chips that combine
  with the free-text focus. All verified live.

- ✅ **Written three-reviewer paper workflow** (Codex, 2026-07-16; owner
  directive). `assessment.interaction` now distinguishes live interviews from
  `written_peer_review`. All Papers & Rebuttals presets use a one-shot written
  packet from Reviewer 1 (constructive methods), Reviewer 2 (always the most
  hostile on novelty/soundness), and Reviewer 3 (significance/framing). The
  validated peer-review schema requires all three voices, every rubric
  criterion exactly once, and a strictly higher severity-weighted criticality
  score for Reviewer 2 without forcing an invented major flaw. Paper stages no
  longer expose panel casting, drills, chat, or voice; Feedback becomes
  Reviewer comments, reports render stacked numbered bullets with anchored
  quotes and suggested revisions, and response letters draft directly from
  the written packet with one validated response per numbered point. Repeated
  drafting reopens the existing response instead of spending quota again. New
  live paper sessions are rejected while legacy sessions/reports remain
  readable but cannot accept new turns.

### Future roadmap (added 2026-07-11) — the next-gen todo list

**M0 — Validation sprint (owner-led; before building more).** Run the real
thing: actual transfer draft → rubric review → full mock viva → assessment →
ledger populates → quick-fire drill retires an item → re-review shows ▲
deltas → one real Reviewer 1/2/3 packet → rebuttal letter. Both providers
exercised. File every paper-cut as a GitHub issue. *Exit criteria: the loop
survives a real document, `weakness_updates` returns from both providers,
and the owner would voluntarily run a second drill.*

**M1 — Daily-use polish (v1.1).** Ship in any order; all are self-contained:
- ✅ **Deadline awareness** (Claude, 2026-07-16) — `src/lib/dates.ts`
  (`daysUntil`/`urgencyOf`/`formatCountdown`, 7 tests; urgent = ≤42 days) +
  `CountdownChip`/`isGateUrgent` in `src/components/countdown.tsx`. Shown on
  the milestone rail nodes, hero status row + gate seal, journey cards, and
  the stage header; the "Your next move" panel gains a gold "gate in N weeks
  — every rehearsal counts" nudge inside six weeks.
- ✅ **Supervisor export** (Claude, 2026-07-16) — `@media print` rules in
  globals.css (`.no-print` on masthead/controls, shadows/animations off) +
  "Print / save as PDF" on the report page, and a print-first one-page
  gate-readiness summary at `/stages/[stageId]/summary` (status, target +
  countdown, readiness checks, session/review counts + latest verdict,
  latest rubric scores as a B/W-safe dot scale, weakness ledger with
  open/improving/resolved). Linked "Supervisor summary" from the stage
  header. Verified live against real thesis data.
- ✅ **Session management** (Claude, 2026-07-16) — migration v4 adds
  `sessions.title`; `renameSession`/`deleteSession` (transactional: wipes
  messages + reports, KEEPS harvested findings); `PATCH`/`DELETE
  /api/sessions/[id]`; sessions list gains hover rename (inline input) and
  delete (inline confirm, no window.confirm); custom titles show in the list
  and viva-room header. Retry: `submitUtterance(id, "")` when the last
  message is an unanswered candidate answer re-sends it WITHOUT duplicating
  (transcript replays minus that message); the viva room error banner offers
  "Retry last answer". Rename round-trip + delete-404 verified live;
  retry-after-provider-error still needs a live error to exercise.
- ✅ **Guided stage stepper** (Claude, 2026-07-16) — the stage tab strip is
  now a numbered stepper: Submit → Feedback → Face the panel → The record
  (review-only stages skip the panel step; Papers uses Submit → Reviewer
  comments → The record). `?step=submit|feedback|panel|record`
  makes every destination bookmarkable while old `?tab=` links still work.
  Feedback has its own focused workspace. A compact programme-scoped endpoint
  supplies readable/review/report counts, latest report id, and a three-state
  panel status; merely creating or abandoning a session cannot mark it done.
  The semantic nav/list exposes current/completed/in-progress state to assistive
  technology, with visible focus, 44px targets, stronger contrast, and explicit
  loading/error states. Dashboard readiness uses the same source of truth.
- ✅ **Quota UX** (Claude, 2026-07-16) — `src/lib/providers/usage.ts`
  remembers each provider's last `usage_limit` error in settings
  (`claude_limited_at`/`codex_limited_at`; NOT settable via the settings
  PUT schema), auto-expires after 5h, and is cleared by the next
  successful provider attempt. Streamed turns and every underlying one-shot
  planner/review/report/rebuttal attempt (including JSON retries) are tracked;
  advisory SQLite failures never replace provider results or errors. `GET
  /api/providers/status` returns fresh `limitedAt` per provider; the
  ProviderPicker shows an amber "hit its usage window at HH:MM — <other>
  looks fresher" note.
- ✅ **M1 hardening + release cleanup** (Codex, 2026-07-16) — v5 assigns
  documents/sessions to validated programmes, scopes collections and AI
  actions to that ownership boundary, and safely backfills legacy rows.
  Stage/dashboard list views use compact activity/report summaries instead of
  downloading report bodies. The masthead follows the selected programme and
  exposes active-page semantics. Geist and Newsreader are bundled locally, so
  production builds no longer depend on Google Fonts. Verified with the full
  then-current 104-test suite and a clean production build. Isolated browser acceptance
  covered direct Feedback URLs + Back/Forward/focus, legacy tab links,
  programme switching, honest active-session progress, and 375/768/1024/1440
  layouts with no horizontal overflow or browser warnings.
- ✅ **Code-review fixes on the hardening batch** (Claude, 2026-09-29).
  (1) Failed response-letter drafts no longer block retries:
  `src/lib/rebuttal/meta.ts` `responseLetterMeta()` (client-safe) marks a
  letter `complete` only when its rubric has parsed `points`; the drafter's
  reuse check and the report page's "View response letter" both require it,
  while failed drafts keep `source_review_id` for back-navigation.
  (2) Migration v5 edited in place (unpushed; the owner's DB already ran it
  with zero mismatches): documents now take the programme of the EARLIEST
  session whose `config.documentIds` names them, falling back to the selected
  programme, then the default — `tests/migrations.test.ts` builds a v4 DB in
  memory. (3) Gate summary: latest scores come from viva assessments OR
  reviews (newest wins); readiness reads `/api/stages/:id/activity` so
  "Panel faced" needs an ended session/assessment; reports load via
  `?stageId=`; the prompts module is no longer bundled client-side.
  (4) `RebuttalRequestError(400|404|409)` → the rebuttal route maps input
  errors to 4xx, only real failures to 500. (5) Feedback-step focus fires
  once per step entry (ref), not on every document reload. (6) Masthead
  names come from `listProgrammes()`; settings fetched once + on
  `aiphd:programme-changed` (both writers dispatch it). (7) Stage pages
  import `StageActivity`/`PanelProgress` from the repo instead of redeclaring.
  (8) Session views resolve stages with `findStage(stageId,
  session.programme_id)`. 123 tests.
- ✅ **Import real reviewer comments** (Claude, 2026-10-09; owner request).
  Papers & Rebuttals → Reviewer comments step gains an "Import the
  reviewers' comments" panel: paste the decision letter (saved as a
  `referee_reports` document for provenance) or pick an uploaded one.
  `src/lib/rebuttal/import.ts` `importReviewerComments()` splits the letter
  into comments whose `text` MUST be verbatim — `importedReviewSchemaFor()`
  rejects paraphrase via a punctuation/case-insensitive head+tail match
  (`isVerbatimFrom`), and the JSON retry names the offending comment id.
  Each comment carries category (major/minor/editorial), stance
  (agree_revise/clarify/partially_agree/respectfully_disagree), a "how to
  solve it" suggestion, action steps, effort, manuscript anchor, and a draft
  reply with [ADD: …] placeholders (never invented data). Stored as
  `doc_review` with rubric `format: "imported_review"` (types in
  `src/lib/review/types.ts`, `parseImportedReview` is client-safe); verdict =
  the letter's decision; major comments seed the weakness ledger. Route:
  `POST /api/documents/[id]/import-comments` (id = manuscript; body `{text}`
  or `{commentsDocumentId}`; `CommentImportError` → 400/404/409, 502 when
  the model output never validates — the letter is kept for a retry).
  `draftRebuttalLetterFromReview` assembles the response letter from the
  per-comment drafts deterministically (NO AI call) via
  `assembleLetterFromImport`. Stage activity / gate summary count
  `imported_review` as reviewer comments; `ReportSummary.format` labels it in
  lists. Report page `ImportedReviewView`: decision banner, strategy,
  per-comment cards with verbatim quote, chips, ticked revision steps
  (localStorage progress bar), category filters, copyable draft replies;
  letter button logic shared via `useResponseLetter`. Live acceptance (Codex,
  isolated DATA_DIR, synthetic letter): praise skipped, a two-request
  paragraph split, all texts passed the verbatim check, decision read,
  placeholders used, letter assembled instantly. 132 tests.

**M2 — Public launch (v1.2).**
- `docs/` landing page on GitHub Pages: screenshots, a 60-second demo
  GIF/video of a drill, install one-liner.
- Demo mode: `npm run demo` seeds synthetic documents/sessions so a
  visitor can tour without spending quota.
- Mobile/responsive pass (viva room first — practice on the bus).
- CONTRIBUTING.md + issue templates; a "add your programme template"
  guide (templates are the natural first PR for outsiders).
- Announce: owner's Oxford/UK network first, then r/PhD // PhD Twitter.
  *Success: 10 external installs, 3 externally-filed issues.*

**M3 — Depth (v2 themes; reprioritize on M2 feedback).**
- **Progress analytics** — per-criterion score trends across sessions and
  versions; a readiness dial per gate ("transfer-ready: 3.8/5 and rising").
- **Hands-free viva** — per-persona TTS voices and auto-listen after each
  question: a full oral rehearsal without touching the keyboard.
- **Defense-talk mode** — upload slides (PDF), present aloud, panel
  interrupts with questions mid-talk; for final-viva/defense stages.
- **Literature-aware examiner** — optionally allow the Codex/Claude web
  search tool ONLY for the examiner to pull real citations ("Kim 2025
  reported 92% — why is yours lower?"). Must not weaken the
  no-filesystem-tools invariant; search-only allowlist.
- **Template community** — accept programme templates for more countries/
  fields; keep the 3 curated presets as the wizard defaults.

**Non-goals (standing, from owner decisions):** no API keys in the core
app; no cloud storage of user documents; no in-app template editor until
users ask; no gamification streaks — the product's tone is a rigorous
colleague, not Duolingo.

---

## 6. Working agreements (both agents)

- **Verify before done:** `npx tsc --noEmit && npx eslint src scripts tests
  && npx vitest run && npm run build` — all must be clean. 118+ tests stay
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
