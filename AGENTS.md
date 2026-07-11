<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI for PhD — project rules

**Before any work, read `docs/BUILD_PLAN.md`** — the single source of truth
for product decisions, architecture, what's shipped, the in-flight task
(Phase B weakness ledger), the roadmap, and the working agreements shared by
all agents (Claude Code and Codex). Update it whenever you ship or re-scope.

Quick facts: local-first Next.js 16 + `node:sqlite`; AI via locally installed
Claude Code / Codex CLIs (subscription auth — never add API-key requirements);
programme structure is data in `src/templates/`; verify with
`npx tsc --noEmit && npx eslint src scripts tests && npx vitest run && npm run build`.
Port 3000 may be the owner's own dev server. The repo is public — synthetic
fixtures only, never commit `data/` or personal documents.
