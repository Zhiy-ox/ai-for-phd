# AI for PhD

Your Oxford DPhil, rehearsed before it's real. A single-user local web app that
structures the doctorate as a journey of formal gates — Transfer of Status,
Confirmation, papers & rebuttals, thesis, final viva — and lets AI both help
you produce the documents and **play the institutional counterpart**: assessors
grilling you in a mock transfer viva, a senior reviewer scoring your report
against the departmental rubric.

**Interactive stages:**

- **Transfer of Status** — rubric feedback on the transfer report + mock viva
  (Dr Chen / Prof Whitfield), ending in a GSO.2-style assessment (Approved /
  Referred / Recommend MSc).
- **Confirmation of Status** — same workflow against a completion-focused
  panel (Dr Okafor / Prof Lindqvist): progress since transfer, thesis outline,
  timetable to submission (GSO.14).
- **Papers & Rebuttals** — upload a manuscript and (optionally) the real
  referee reports, then spar with Reviewer 2 and an associate editor before
  writing the actual response letter. Verdict: minor / major revision / reject.

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
cd "/Users/xuzhiyu/Documents/AI for PhD"
npm install
npx tsx scripts/seed.ts     # seed stage instances (idempotent)
npm run dev                 # → http://localhost:3000
```

Requirements: Node ≥ 22.13 (uses built-in `node:sqlite`), Claude Code and/or
Codex CLI installed and logged in. Binary paths are configured in `.env.local`
(`CLAUDE_BIN`, `CODEX_BIN`); data lives in `data/` (gitignored).

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
