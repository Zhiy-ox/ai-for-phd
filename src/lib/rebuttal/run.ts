// Rebuttal-letter drafter: turns an ended sparring session (+ the uploaded
// referee reports) into a point-by-point response-to-reviewers letter the
// author can polish and submit. See docs/BUILD_PLAN.md §5 Phase C.
import { z } from "zod";
import { getStage } from "@/lib/template";
import { getProvider, resolveProviderAndModel } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import { getSession, listMessages } from "@/lib/db/repos/sessions";
import { getDocument } from "@/lib/db/repos/documents";
import { getReport, insertReport, listReports, type ReportRow } from "@/lib/db/repos/reports";
import { responseLetterMeta } from "./meta";
import { completeJsonWithUsageTracking } from "@/lib/providers/usage-completion";
import type { VivaConfig } from "@/lib/viva/types";
import { PeerReviewResultSchema } from "@/lib/review/prompts";
import type { PeerReviewResult } from "@/lib/review/types";
import { getActiveProgrammeId } from "@/lib/programme";

export interface RebuttalLetter {
  // Stored locally after generation so repeated clicks can reopen the response
  // without spending quota or losing the reviewer packet it answers.
  source_review_id?: string;
  preamble: string;
  points: {
    // e.g. "Reviewer 2, point 3"
    source: string;
    // The referee's criticism, quoted or faithfully paraphrased.
    quote: string;
    // The author's response, drawing on how the point was defended in sparring.
    response: string;
    // The concrete manuscript change committed to ("None" when standing firm).
    action: string;
    // Where in the manuscript the change lands, when applicable.
    location: string;
  }[];
  closing: string;
}

export const RebuttalLetterSchema: z.ZodType<RebuttalLetter> = z.object({
  source_review_id: z.string().optional(),
  preamble: z.string(),
  points: z
    .array(
      z.object({
        source: z.string(),
        quote: z.string(),
        response: z.string(),
        action: z.string(),
        location: z.string(),
      }),
    )
    .min(1),
  closing: z.string(),
});

const PEER_REVIEWER_IDS = ["reviewer_1", "reviewer_2", "reviewer_3"] as const;

export function peerReviewPointLabels(review: PeerReviewResult): string[] {
  return PEER_REVIEWER_IDS.flatMap((reviewer) => {
    const reviewerNumber = reviewer.slice(-1);
    return review.sections
      .filter((section) => section.reviewer === reviewer)
      .map((_, index) => `Reviewer ${reviewerNumber}, comment ${reviewerNumber}.${index + 1}`);
  });
}

export function rebuttalLetterSchemaForReview(
  review: PeerReviewResult,
): z.ZodType<RebuttalLetter> {
  const expectedSources = peerReviewPointLabels(review);
  return RebuttalLetterSchema.superRefine((letter, ctx) => {
    if (letter.points.length !== expectedSources.length) {
      ctx.addIssue({
        code: "custom",
        message: `The response must contain exactly ${expectedSources.length} points`,
        path: ["points"],
      });
      return;
    }
    letter.points.forEach((point, index) => {
      if (point.source.trim().toLowerCase() !== expectedSources[index].toLowerCase()) {
        ctx.addIssue({
          code: "custom",
          message: `Expected source "${expectedSources[index]}" at position ${index + 1}`,
          path: ["points", index, "source"],
        });
      }
    });
  });
}

/** A request the caller can fix (bad id, wrong report kind, wrong
 *  programme) — distinct from a server or provider failure. */
export class RebuttalRequestError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "RebuttalRequestError";
  }
}

const MAX_BLOCK_CHARS = 100_000;
function clip(text: string): string {
  return text.length <= MAX_BLOCK_CHARS
    ? text
    : `${text.slice(0, MAX_BLOCK_CHARS)}\n[... truncated ...]`;
}

export function renderRebuttalMarkdown(letter: RebuttalLetter): string {
  const lines = [
    "# Response to Reviewers",
    "",
    letter.preamble.trim(),
    "",
    ...letter.points.flatMap((p, i) => [
      `## ${i + 1}. ${p.source}`,
      "",
      `> ${p.quote.trim().replace(/\n/g, "\n> ")}`,
      "",
      `**Response.** ${p.response.trim()}`,
      "",
      `**Change made.** ${p.action.trim()}${
        p.location.trim() && p.action.trim().toLowerCase() !== "none"
          ? ` *(${p.location.trim()})*`
          : ""
      }`,
      "",
    ]),
    letter.closing.trim(),
    "",
  ];
  return lines.join("\n");
}

export async function draftRebuttalLetter(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ReportRow> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const config = JSON.parse(session.config_json) as VivaConfig;
  const stage = getStage(config.programmeId, config.stageId);
  if (
    !stage.activities.includes("rebuttal_roleplay") &&
    !stage.activities.includes("peer_review")
  ) {
    throw new Error("Rebuttal letters are drafted from Papers & Rebuttals sessions.");
  }
  const messages = listMessages(sessionId);
  if (messages.length === 0) {
    throw new Error("This session has no exchanges to draft from.");
  }

  const docs = config.documentIds
    .map((id) => getDocument(id))
    .filter((d) => d !== null && d.extracted_text);
  const manuscript = docs[0];
  const refereeReports = docs.filter((d) => d!.kind === "referee_reports");

  const transcript = messages
    .map((m) =>
      m.role === "user" ? `AUTHOR: ${m.content}` : `PANEL${m.speaker ? ` [${m.speaker}]` : ""}: ${m.content}`,
    )
    .join("\n\n");

  const systemPrompt = [
    "You are an experienced academic co-author drafting a response-to-reviewers letter. You write in the first person plural (\"we\"), courteous and confident: thank reviewers briefly, answer every substantive point head-on with evidence, concede gracefully where the criticism lands, and state precisely what was changed in the manuscript. Never grovel, never evade.",
    "",
    "# Inputs",
    "- The manuscript under review (for titles, sections, and claims).",
    refereeReports.length > 0
      ? "- The actual referee reports: cover EVERY substantive point from them, in order, grouped by reviewer."
      : "- No referee reports were uploaded: reconstruct the substantive objections from the sparring transcript instead.",
    "- A sparring-rehearsal transcript in which the author practised defending the paper. Mine it for the author's strongest arguments and any concessions — but write the letter's responses yourself at publication quality; do not quote the transcript.",
    "",
    "# Rules",
    "- One entry per substantive referee point. \"source\" like \"Reviewer 2, point 3\" (or \"Panel objection 2\" when reconstructing).",
    "- \"quote\": the referee's point, quoted or faithfully condensed.",
    "- \"response\": the scientific answer, with numbers/citations where the transcript or manuscript provides them.",
    "- \"action\": the concrete manuscript change, or \"None\" with the response carrying the justification for standing firm.",
    "- \"location\": section/figure reference for the change, empty string when action is None.",
    "- preamble: 2–3 sentences thanking the reviewers and summarising the main revisions. closing: 1–2 sentences.",
    "",
    "# Output format",
    "Respond with a SINGLE fenced ```json code block and nothing else, matching exactly:",
    "```json",
    '{ "preamble": "...", "points": [{ "source": "...", "quote": "...", "response": "...", "action": "...", "location": "..." }], "closing": "..." }',
    "```",
  ].join("\n");

  const userMessage = [
    manuscript ? `<manuscript title="${manuscript!.filename}">\n${clip(manuscript!.extracted_text!)}\n</manuscript>` : "",
    ...refereeReports.map(
      (d) => `<referee_reports title="${d!.filename}">\n${clip(d!.extracted_text!)}\n</referee_reports>`,
    ),
    `<sparring_transcript>\n${clip(transcript)}\n</sparring_transcript>`,
    "",
    "Draft the response-to-reviewers letter now as a single fenced ```json code block. Output nothing outside the block.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const provider = getProvider(config.provider);
  const result = await completeJsonWithUsageTracking(
    provider,
    { systemPrompt, userMessage, model: config.model },
    RebuttalLetterSchema,
    signal,
  );

  if (!result.ok) {
    return insertReport({ sessionId, type: "rebuttal_letter", contentMd: result.rawText });
  }
  return insertReport({
    sessionId,
    type: "rebuttal_letter",
    rubric: result.value,
    contentMd: renderRebuttalMarkdown(result.value),
  });
}

export async function draftRebuttalLetterFromReview(
  reviewReportId: string,
  opts?: { provider?: ProviderId; model?: string },
  signal?: AbortSignal,
): Promise<ReportRow> {
  const reviewReport = getReport(reviewReportId);
  if (!reviewReport) throw new RebuttalRequestError(404, `Report not found: ${reviewReportId}`);
  if (reviewReport.type !== "doc_review" || !reviewReport.document_id) {
    throw new RebuttalRequestError(
      400,
      "A response letter can only be drafted from written reviewer comments.",
    );
  }
  if (!reviewReport.rubric_json) {
    throw new RebuttalRequestError(400, "This review has no structured reviewer comments to answer.");
  }
  let rawReview: unknown;
  try {
    rawReview = JSON.parse(reviewReport.rubric_json);
  } catch {
    throw new RebuttalRequestError(400, "This review has invalid structured reviewer comments.");
  }
  const parsedReview = PeerReviewResultSchema.safeParse(rawReview);
  if (!parsedReview.success) {
    throw new RebuttalRequestError(400, "This report is not a three-reviewer written peer review.");
  }
  const manuscript = getDocument(reviewReport.document_id);
  if (!manuscript) {
    throw new RebuttalRequestError(404, `Document not found: ${reviewReport.document_id}`);
  }
  const programmeId = getActiveProgrammeId();
  if (manuscript.programme_id !== programmeId) {
    throw new RebuttalRequestError(
      409,
      `Document "${manuscript.filename}" belongs to programme "${manuscript.programme_id}", not the active programme "${programmeId}".`,
    );
  }
  if (!manuscript.stage_id || !manuscript.extracted_text) {
    throw new RebuttalRequestError(
      400,
      "The reviewed manuscript has no readable text or stage assignment.",
    );
  }
  const stage = getStage(programmeId, manuscript.stage_id);
  if (!stage.activities.includes("peer_review")) {
    throw new RebuttalRequestError(
      400,
      "Response letters from reviewer comments are available in Papers & Rebuttals.",
    );
  }

  // Reuse only a finished letter; a failed draft must not block a retry.
  const existing = listReports({ documentId: manuscript.id, type: "rebuttal_letter" }).find(
    (report) => {
      const meta = responseLetterMeta(report.rubric_json);
      return meta.complete && meta.sourceReviewId === reviewReport.id;
    },
  );
  if (existing) return existing;

  const { provider, model } = resolveProviderAndModel(opts);
  const expectedSources = peerReviewPointLabels(parsedReview.data);
  const systemPrompt = [
    "You are an experienced academic co-author drafting a point-by-point response-to-reviewers letter from a written peer-review packet. Write in the first person plural (\"we\"), courteous and confident. Answer every substantive point in reviewer order, concede where warranted, and state a concrete manuscript change.",
    "",
    "# Non-negotiable rules",
    `- Return exactly ${expectedSources.length} response points, in this exact order: ${expectedSources.join("; ")}.`,
    "- Never invent experiments, measurements, statistics, citations, or manuscript changes. When the supplied manuscript cannot support an answer, use a clear bracketed author placeholder such as [ADD CONTROL RESULT] or [AUTHOR TO CONFIRM].",
    "- \"source\": use labels like \"Reviewer 2, comment 2.3\".",
    "- \"quote\": faithfully condense the reviewer's criticism.",
    "- \"response\": give the strongest scientifically honest answer available from the manuscript.",
    "- \"action\": state the concrete revision, or \"None\" only when the response justifies standing firm.",
    "- \"location\": name the section or figure when known; otherwise use a precise placeholder.",
    "- preamble: 2–3 sentences thanking the reviewers and summarising the revision strategy. closing: 1–2 sentences.",
    "",
    "# Output format",
    "Respond with one fenced ```json block and nothing else:",
    "```json",
    '{ "preamble": "...", "points": [{ "source": "...", "quote": "...", "response": "...", "action": "...", "location": "..." }], "closing": "..." }',
    "```",
  ].join("\n");
  const userMessage = [
    `<manuscript title="${manuscript.filename.replace(/"/g, "'")}">`,
    clip(manuscript.extracted_text),
    "</manuscript>",
    "",
    "<written_peer_review>",
    clip(JSON.stringify(parsedReview.data, null, 2)),
    "</written_peer_review>",
    "",
    "Draft the complete response letter now. Output only the fenced JSON block.",
  ].join("\n");
  const result = await completeJsonWithUsageTracking(
    provider,
    { systemPrompt, userMessage, model },
    rebuttalLetterSchemaForReview(parsedReview.data),
    signal,
  );
  if (!result.ok) {
    return insertReport({
      documentId: manuscript.id,
      type: "rebuttal_letter",
      rubric: { source_review_id: reviewReport.id },
      contentMd: result.rawText,
    });
  }
  return insertReport({
    documentId: manuscript.id,
    type: "rebuttal_letter",
    rubric: { ...result.value, source_review_id: reviewReport.id },
    contentMd: renderRebuttalMarkdown(result.value),
  });
}
