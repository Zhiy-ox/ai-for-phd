# AI for PhD

**Your doctorate, rehearsed before it's real.** A local-first web app that
structures the PhD as a journey of formal gates — upgrade/transfer viva,
confirmation, papers & rebuttals, thesis, final defence — and lets AI both
help you produce the documents and **play the institutional counterpart**:
assessors grilling you in a mock viva, Reviewer 2 attacking your manuscript,
a senior reviewer scoring your drafts against the departmental rubric.

- **No API keys, no cloud.** Runs on your machine, on Claude/ChatGPT
  subscriptions you already have. Your unpublished research never leaves
  your laptop.
- **Three programme presets** — Oxford DPhil, generic UK PhD, US PhD
  (quals → candidacy → defense) — picked in a first-run wizard; every stage,
  rubric, and examiner panel is data you can edit.
- **Choose your panel's mood** — supportive rehearsal, standard, or a
  hostile worst-day panel, plus a "press me especially on…" focus.
- **Answer by voice** — the examiner asks, you speak, the transcript goes in.

**Every stage of the journey is interactive** (Oxford DPhil preset shown):

- **Probationer Research Student** — feedback on your research proposal and
  literature review (question, significance, approach, literature, prose).

- **Transfer of Status** — rubric feedback on the transfer report + mock viva
  (Dr Chen / Prof Whitfield), ending in a GSO.2-style assessment (Approved /
  Referred / Recommend MSc).
- **Confirmation of Status** — same workflow against a completion-focused
  panel (Dr Okafor / Prof Lindqvist): progress since transfer, thesis outline,
  timetable to submission (GSO.14).
- **Papers & Rebuttals** — upload a manuscript and (optionally) the real
  referee reports, then spar with Reviewer 2 and an associate editor before
  writing the actual response letter. Verdict: minor / major revision / reject.
- **Thesis Writing** — chapter-by-chapter feedback against a thesis rubric
  (argument, structure, rigor, literature, prose). Review-only: no panel here.
- **Final Viva** — the full viva voce against an internal examiner (Dr Rahimi,
  forensic, chapter by chapter) and an external (Prof Baumgartner, attacks
  novelty against the field). Outcomes mirror Oxford's: pass / minor
  corrections / major corrections / refer for resubmission / MPhil.
- **Corrections & Completion** — review of your corrections response against
  what examiners actually check: coverage of every required point, substance
  of each response, and traceability (page references they can verify fast).

## No API keys

The AI runs on your existing subscriptions via locally installed CLIs:

| Backend | Auth | SDK |
|---|---|---|
| **Claude Code** | your Claude subscription (`claude` login) | `@anthropic-ai/claude-agent-sdk` |
| **Codex** | your ChatGPT subscription (`codex login`) | `@openai/codex-sdk` |

Pick the backend per session; the Settings page shows live login status for
both. If a session dies mid-viva (token expiry, usage window), the transcript
is persisted and replayed into a fresh session — nothing is lost.

## Run it

```bash
git clone https://github.com/Zhiy-ox/ai-for-phd.git
cd ai-for-phd
npm install
npm run dev                 # → http://localhost:3000
```

First launch opens a **setup wizard**: it checks your AI backends, lets you
pick a programme preset, and asks where you are in the doctorate. No
configuration files needed — the `claude`/`codex` CLIs are auto-detected from
your PATH and common install locations (override with `CLAUDE_BIN`/`CODEX_BIN`
env vars if you keep them somewhere unusual).

Requirements: Node ≥ 22.13 (uses the built-in `node:sqlite`), and at least one
of [Claude Code](https://claude.com/claude-code) (`claude` — log in once) or
the [Codex CLI](https://github.com/openai/codex) (`codex login`). All app data
lives in `data/` inside the folder (gitignored — your documents, transcripts,
and reports stay local).

## Voice answers

In any live session you can answer by voice: the panel asks in chat, you press
**Speak**, talk (pauses are fine — the mic stays open), press **Stop**, review
the transcript in the composer, and **Send**. Transcription uses the browser's
built-in Web Speech API — no keys, works in Chrome and Safari (Chrome routes
audio through its speech service; recent Safari transcribes on-device). The
**Read aloud** toggle in the session header speaks each panel question via the
system voice.

## Typical flow

1. **Dashboard** — the journey map. Transfer of Status is active; other stages
   are previews.
2. **Upload your transfer report** (Documents tab of the stage, or the
   Documents library). Prefer `.tex`/`.md` over PDF for extraction quality;
   there is a paste-text fallback.
3. **Get feedback** — one click runs a rubric review with anchored,
   severity-graded findings and top actions.
4. **Mock viva** — pick the report and a backend, then face Dr Chen and
   Prof Whitfield. Answer in chat; they follow up when you're vague.
5. **End viva & get assessment** — the panel deliberates and files a
   GSO.2-style report.

## Architecture notes

- **Programme-as-data**: the whole pipeline renders from
  `src/templates/oxford-dphil.ts` (zod-validated in `src/lib/template.ts`).
  Another university/programme = another template file.
- **Provider seam**: `src/lib/providers/types.ts` defines `LLMProvider`;
  `claude.ts`/`codex.ts` adapt the two agent runtimes to plain streamed chat
  (tools disabled, empty scratch cwd). A raw-API provider can be added later
  for cloud deployment.
- **Viva engine** (`src/lib/viva/`): question planner → panel system prompt →
  one streamed LLM call per turn → SSE to the browser → assessment report.
  Modality-agnostic; voice can be layered on without rework.
- **Persistence**: `node:sqlite` (`data/app.db`) — stages, documents (with
  extracted text), sessions, messages, reports, settings.

## Tests & smoke

```bash
npm test                          # 64 unit tests (no CLI/network needed)
npx tsx scripts/smoke-providers.ts  # live check of both CLI backends (spends quota)
```
