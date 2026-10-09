// Import REAL reviewer comments (the decision letter a journal sent back):
// split the letter into verbatim comments, attach a resolution plan and a
// draft reply to each, store it as a reviewer-comments report on the
// manuscript, and seed the weakness ledger with the major points.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { documentsDir } from "@/lib/db/client";
import {
  getDocument,
  insertDocument,
  updateDocumentMeta,
  updateExtraction,
  type DocumentRow,
} from "@/lib/db/repos/documents";
import { insertReport, type ReportRow } from "@/lib/db/repos/reports";
import { insertFinding } from "@/lib/db/repos/findings";
import { getActiveProgrammeId } from "@/lib/programme";
import { getStage, type StageTemplate } from "@/lib/template";
import { resolveProviderAndModel } from "@/lib/providers/registry";
import { completeJsonWithUsageTracking } from "@/lib/providers/usage-completion";
import type { ProviderId } from "@/lib/providers/types";
import {
  IMPORTED_EFFORT_LABELS,
  IMPORTED_STANCE_LABELS,
  type ImportedReviewResult,
} from "@/lib/review/types";
import type { RebuttalLetter } from "./run";

// A long decision letter is ~10–20k characters; anything far beyond this is
// almost certainly the wrong file (e.g. the manuscript itself).
export const MAX_LETTER_CHARS = 60_000;
const MAX_MANUSCRIPT_CHARS = 100_000;

/** A request the caller can fix, or (502) a model reply that never validated. */
export class CommentImportError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 502,
    message: string,
  ) {
    super(message);
    this.name = "CommentImportError";
  }
}

// ---------------------------------------------------------------------------
// Verbatim check. Reviewers' words are the one thing the model must never
// rewrite. Comparison ignores case, punctuation, and whitespace so PDF
// line-breaks and curly quotes don't cause false rejections.

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when both the opening and closing words of the comment appear in the letter. */
export function isVerbatimFrom(commentText: string, normalizedLetter: string): boolean {
  const needle = normalizeForMatch(commentText);
  if (!needle) return false;
  const head = needle.slice(0, 80).trim();
  const tail = needle.slice(-60).trim();
  return normalizedLetter.includes(head) && normalizedLetter.includes(tail);
}

const CommentSchema = z.object({
  id: z.string().trim().min(1).max(20),
  reviewer: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1),
  category: z.enum(["major", "minor", "editorial"]),
  stance: z.enum(["agree_revise", "clarify", "partially_agree", "respectfully_disagree"]),
  suggestion: z.string().trim().min(1),
  actions: z.array(z.string().trim().min(1)).max(8),
  draft_response: z.string().trim().min(1),
  effort: z.enum(["quick", "moderate", "substantial"]),
  manuscript_anchor: z.string(),
});

type ModelImport = Omit<ImportedReviewResult, "format" | "source_document_id">;

export function importedReviewSchemaFor(letter: string): z.ZodType<ModelImport> {
  const normalizedLetter = normalizeForMatch(letter);
  return z
    .object({
      decision: z.enum(["accept", "minor_revision", "major_revision", "reject", "unknown"]),
      editor_summary: z.string(),
      reviewers: z
        .array(z.object({ label: z.string().trim().min(1), summary: z.string() }))
        .min(1),
      comments: z.array(CommentSchema).min(1).max(150),
      strategy: z.array(z.string().trim().min(1)).min(1).max(8),
    })
    .superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.comments.forEach((comment, index) => {
        if (seen.has(comment.id)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate comment id "${comment.id}" — every comment needs a unique id`,
            path: ["comments", index, "id"],
          });
        }
        seen.add(comment.id);
        if (!isVerbatimFrom(comment.text, normalizedLetter)) {
          ctx.addIssue({
            code: "custom",
            message: `Comment ${comment.id} is not the reviewer's exact wording — copy it verbatim from the letter`,
            path: ["comments", index, "text"],
          });
        }
      });
    });
}

// ---------------------------------------------------------------------------
// Prompt

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... truncated ...]`;
}

export function buildImportPrompt(args: {
  stage: StageTemplate;
  manuscriptTitle: string;
  manuscriptText: string;
  letterText: string;
}): { systemPrompt: string; userMessage: string } {
  const systemPrompt = [
    "You are a senior academic — an experienced corresponding author and journal referee — helping a PhD student respond to the REAL peer-review comments they received on their manuscript. Your output is a revision plan they will act on, so honesty matters more than reassurance.",
    "",
    "# Task",
    "1. Split the decision letter into individual reviewer comments.",
    "2. For each comment, decide how the author should resolve it, list the concrete revision steps, and draft a reply.",
    "3. Write a short overall revision strategy.",
    "",
    "# Splitting rules",
    "- One entry per distinct request or criticism. If one paragraph makes several separable requests, split it. Keep the reviewers' order and their own numbering when present.",
    "- \"text\" MUST be copied VERBATIM from the letter — the reviewer's exact words. Never paraphrase, summarise, translate, or fix typos. You may drop leading numbering such as \"1.\" or \"(a)\".",
    "- Skip pure praise or pleasantries (\"The paper is well written.\") — mention them in that reviewer's summary instead.",
    "- \"reviewer\" uses the letter's own naming (\"Reviewer 2\", \"Referee #1\", \"Editor\").",
    "- \"id\": R<reviewer number>.<point number> (e.g. \"R2.3\"); use E.<n> for the editor. Ids must be unique.",
    "- \"category\": major (substantive science/method/claims), minor (small scientific points), editorial (wording, typos, formatting, references).",
    "",
    "# Resolution rules",
    "- \"stance\": agree_revise when the criticism is right; clarify when the manuscript already handles it but was misread — say where, and still make it clearer; partially_agree; respectfully_disagree ONLY with a concrete scientific reason grounded in the manuscript, and still offer a small concession (a sentence of discussion, a caveat).",
    "- \"suggestion\": 1–3 sentences on HOW to solve it — the smartest, most economical fix, and the risk if it is ignored.",
    "- \"actions\": concrete steps (\"Add error bars from the 3 repeat runs to Fig. 3b\"), not platitudes.",
    "- \"effort\": quick (text edits, under a day), moderate (re-analysis, new figure), substantial (new experiments or fabrication).",
    "- \"manuscript_anchor\": the section, figure, table, or equation in the manuscript the change belongs to; empty string if none applies.",
    "- \"draft_response\": first-person plural, courteous and direct, 2–5 sentences. Engage the substance immediately — at most a brief thanks. State what was changed and where.",
    "- NEVER invent results, numbers, citations, or experiments the author has not done. When the reply needs facts you do not have, write a bracketed placeholder for the author, e.g. [ADD: repeatability over 5 samples] or [AUTHOR TO CONFIRM].",
    "",
    "# Overall",
    "- \"decision\": the editor's decision as stated in the letter (accept, minor_revision, major_revision, reject), or \"unknown\" if it is not stated.",
    "- \"editor_summary\": 1–3 sentences on what the editor and reviewers fundamentally want.",
    "- \"reviewers\": one entry per reviewer (and the editor if they comment) with a one-sentence summary of their stance.",
    "- \"strategy\": 3–6 ordered points — what to fix first, single fixes that resolve several comments (cite ids), and the riskiest comments.",
    "",
    "# Output format",
    "Respond with ONE fenced ```json block and nothing else:",
    "```json",
    '{ "decision": "major_revision", "editor_summary": "...", "reviewers": [{ "label": "Reviewer 1", "summary": "..." }], "comments": [{ "id": "R1.1", "reviewer": "Reviewer 1", "text": "<verbatim>", "category": "major", "stance": "agree_revise", "suggestion": "...", "actions": ["..."], "draft_response": "...", "effort": "moderate", "manuscript_anchor": "Section 3.2" }], "strategy": ["..."] }',
    "```",
  ].join("\n");

  const title = args.manuscriptTitle.replace(/"/g, "'");
  const userMessage = [
    `Stage: ${args.stage.title}`,
    "",
    `<manuscript title="${title}">`,
    clip(args.manuscriptText, MAX_MANUSCRIPT_CHARS),
    "</manuscript>",
    "",
    "<decision_letter>",
    args.letterText,
    "</decision_letter>",
    "",
    "NOTE: both texts may come from PDF extraction, so symbols and line breaks can be garbled — copy the reviewers' words as they appear in <decision_letter>.",
    "",
    "Produce the revision plan now as one fenced ```json block.",
  ].join("\n");

  return { systemPrompt, userMessage };
}

// ---------------------------------------------------------------------------
// Markdown rendering (the report's content_md: printable and exportable)

export function renderImportedReviewMarkdown(
  manuscriptName: string,
  review: ImportedReviewResult,
): string {
  const byReviewer = new Map<string, typeof review.comments>();
  for (const comment of review.comments) {
    const list = byReviewer.get(comment.reviewer) ?? [];
    list.push(comment);
    byReviewer.set(comment.reviewer, list);
  }
  return [
    `# Reviewer comments — ${manuscriptName}`,
    "",
    `**Decision:** ${review.decision === "unknown" ? "not stated" : review.decision.replace(/_/g, " ")}`,
    "",
    review.editor_summary.trim(),
    "",
    "## Revision strategy",
    "",
    ...review.strategy.map((point, i) => `${i + 1}. ${point}`),
    "",
    ...[...byReviewer.entries()].flatMap(([reviewer, comments]) => [
      `## ${reviewer}`,
      "",
      review.reviewers.find((r) => r.label === reviewer)?.summary.trim() ?? "",
      "",
      ...comments.flatMap((c) => [
        `### ${c.id} · ${c.category} · ${IMPORTED_STANCE_LABELS[c.stance]} · ${IMPORTED_EFFORT_LABELS[c.effort]}`,
        "",
        `> ${c.text.trim().replace(/\n/g, "\n> ")}`,
        "",
        `**How to solve it.** ${c.suggestion.trim()}`,
        "",
        ...c.actions.map((a) => `- [ ] ${a}`),
        ...(c.actions.length ? [""] : []),
        `**Draft response${c.manuscript_anchor ? ` (${c.manuscript_anchor})` : ""}.** ${c.draft_response.trim()}`,
        "",
      ]),
    ]),
  ].join("\n");
}

/** Response letter built straight from the per-comment drafts: no AI call. */
export function assembleLetterFromImport(review: ImportedReviewResult): RebuttalLetter {
  return {
    preamble:
      "We thank the editor and the reviewers for their careful reading of our manuscript and their constructive comments. We have revised the manuscript accordingly; below, each comment is quoted, followed by our response and the corresponding change. [AUTHOR: summarise the main revisions in one or two sentences.]",
    points: review.comments.map((c) => ({
      source: `${c.reviewer}, comment ${c.id}`,
      quote: c.text,
      response: c.draft_response,
      action: c.actions.length > 0 ? c.actions.join("; ") : "None",
      location: c.actions.length > 0 ? c.manuscript_anchor : "",
    })),
    closing:
      "We hope the revised manuscript now addresses all of the reviewers' concerns, and we thank the editor for considering it for publication.",
  };
}

// ---------------------------------------------------------------------------
// Orchestration

async function savePastedLetter(
  text: string,
  manuscript: DocumentRow,
  programmeId: string,
): Promise<DocumentRow> {
  const filePath = path.join(documentsDir, `${crypto.randomUUID()}.txt`);
  await writeFile(filePath, text, "utf8");
  const date = new Date().toISOString().slice(0, 10);
  const row = insertDocument({
    programmeId,
    filename: `Reviewer comments (pasted ${date}).txt`,
    kind: "referee_reports",
    stageId: manuscript.stage_id,
    filePath,
  });
  updateExtraction(row.id, { text, charCount: text.length });
  return getDocument(row.id)!;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export async function importReviewerComments(
  args: {
    manuscriptId: string;
    text?: string;
    commentsDocumentId?: string;
    provider?: ProviderId;
    model?: string;
  },
  signal?: AbortSignal,
): Promise<ReportRow> {
  const programmeId = getActiveProgrammeId();
  const manuscript = getDocument(args.manuscriptId);
  if (!manuscript) throw new CommentImportError(404, `Document not found: ${args.manuscriptId}`);
  if (manuscript.programme_id !== programmeId) {
    throw new CommentImportError(
      409,
      `Document "${manuscript.filename}" belongs to programme "${manuscript.programme_id}", not the active programme "${programmeId}".`,
    );
  }
  if (manuscript.kind !== "paper") {
    throw new CommentImportError(
      400,
      "Import reviewer comments against the manuscript (a “Paper / manuscript” document).",
    );
  }
  if (!manuscript.extracted_text || !manuscript.stage_id) {
    throw new CommentImportError(400, "The manuscript has no readable text or stage assignment.");
  }
  let stage: StageTemplate;
  try {
    stage = getStage(programmeId, manuscript.stage_id);
  } catch {
    throw new CommentImportError(400, `Unknown stage for this manuscript: ${manuscript.stage_id}`);
  }
  if (!stage.activities.includes("peer_review")) {
    throw new CommentImportError(400, "Reviewer comments can be imported in Papers & Rebuttals.");
  }

  let source: DocumentRow;
  if (args.commentsDocumentId) {
    const found = getDocument(args.commentsDocumentId);
    if (!found) throw new CommentImportError(404, `Document not found: ${args.commentsDocumentId}`);
    if (found.programme_id !== programmeId) {
      throw new CommentImportError(409, `"${found.filename}" belongs to another programme.`);
    }
    if (found.id === manuscript.id) {
      throw new CommentImportError(
        400,
        "Choose the reviewers' letter, not the manuscript the comments are about.",
      );
    }
    // Any upload can be the letter (.docx, .pdf, .md, …), whatever kind it
    // was filed under; once chosen it is filed as reviewer comments so it
    // stops appearing as a manuscript.
    source =
      found.kind === "referee_reports"
        ? found
        : (updateDocumentMeta(found.id, { kind: "referee_reports" }) ?? found);
  } else if (args.text?.trim()) {
    if (args.text.length > MAX_LETTER_CHARS) {
      throw new CommentImportError(
        400,
        `That is ${args.text.length.toLocaleString()} characters — a decision letter is usually under ${MAX_LETTER_CHARS.toLocaleString()}. Paste only the reviewers' comments.`,
      );
    }
    source = await savePastedLetter(args.text.trim(), manuscript, programmeId);
  } else {
    throw new CommentImportError(
      400,
      "Paste the reviewers' comments, or choose an uploaded referee-reports file.",
    );
  }
  const letter = source.extracted_text?.trim();
  if (!letter) {
    throw new CommentImportError(400, `"${source.filename}" has no readable text.`);
  }
  if (letter.length > MAX_LETTER_CHARS) {
    throw new CommentImportError(
      400,
      `"${source.filename}" is too long to be a decision letter (${letter.length.toLocaleString()} characters).`,
    );
  }

  const { provider, model } = resolveProviderAndModel(args);
  const { systemPrompt, userMessage } = buildImportPrompt({
    stage,
    manuscriptTitle: manuscript.filename,
    manuscriptText: manuscript.extracted_text,
    letterText: letter,
  });
  const result = await completeJsonWithUsageTracking(
    provider,
    { systemPrompt, userMessage, model },
    importedReviewSchemaFor(letter),
    signal,
  );
  if (!result.ok) {
    throw new CommentImportError(
      502,
      `The AI could not split the letter reliably (${result.error}). Nothing was lost — the letter is saved as "${source.filename}"; try the import again.`,
    );
  }

  const review: ImportedReviewResult = {
    format: "imported_review",
    ...result.value,
    source_document_id: source.id,
  };
  const report = insertReport({
    documentId: manuscript.id,
    type: "doc_review",
    verdict: review.decision === "unknown" ? null : review.decision,
    rubric: review,
    contentMd: renderImportedReviewMarkdown(manuscript.filename, review),
  });
  // Real major criticisms join the weakness ledger, so later panels and
  // drills keep pressing on them until they are closed out.
  for (const comment of review.comments) {
    if (comment.category !== "major") continue;
    insertFinding({
      programmeId,
      stageId: stage.id,
      description: `${comment.reviewer} (${comment.id}): ${truncate(comment.text, 240)}`,
      evidence: comment.manuscript_anchor || null,
      sourceType: "doc_review",
      sourceId: report.id,
    });
  }
  return report;
}
