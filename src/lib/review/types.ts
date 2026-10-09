// Structured output of a rubric-based document review, stored in
// reports.rubric_json (type='doc_review').

export interface DocReviewSection {
  // Verbatim snippet (<= 20 words) from the document; the UI fuzzy-matches it
  // against the extracted text to anchor the comment. Unmatched anchors
  // degrade to a plain list entry.
  anchor_quote: string;
  section_hint: string;
  severity: "minor" | "moderate" | "major";
  comment: string;
  suggestion: string;
}

export type PeerReviewerId = "reviewer_1" | "reviewer_2" | "reviewer_3";

export interface PeerReviewSection extends DocReviewSection {
  reviewer: PeerReviewerId;
}

export interface DocReviewResult {
  summary: string;
  criteria: { id: string; score: number; comments: string }[];
  sections: DocReviewSection[];
  top_actions: string[];
}

export interface PeerReviewResult extends DocReviewResult {
  format: "peer_review";
  recommendation: "accept" | "minor_revision" | "major_revision" | "reject";
  reviewer_summaries: Record<PeerReviewerId, string>;
  sections: PeerReviewSection[];
}

export type ReviewResult = DocReviewResult | PeerReviewResult;

// ---------------------------------------------------------------------------
// Imported REAL reviewer comments (a journal decision letter the author
// received), split into verbatim comments, each with a resolution plan.
// Stored as a doc_review report on the manuscript with format
// "imported_review". No rubric scores: real referees don't use ours.

export type ImportedCommentCategory = "major" | "minor" | "editorial";
export type ImportedCommentStance =
  | "agree_revise"
  | "clarify"
  | "partially_agree"
  | "respectfully_disagree";
export type ImportedCommentEffort = "quick" | "moderate" | "substantial";
export type ImportedDecision = "accept" | "minor_revision" | "major_revision" | "reject" | "unknown";

export interface ImportedComment {
  // "R2.3" for Reviewer 2's third point, "E.1" for the editor.
  id: string;
  // As named in the letter: "Reviewer 2", "Referee #1", "Editor".
  reviewer: string;
  // Copied verbatim from the letter — the validator rejects paraphrase.
  text: string;
  category: ImportedCommentCategory;
  stance: ImportedCommentStance;
  // How to resolve it, in plain words.
  suggestion: string;
  // Concrete revision steps.
  actions: string[];
  // A ready-to-edit reply; unknown facts appear as [BRACKETED PLACEHOLDERS].
  draft_response: string;
  effort: ImportedCommentEffort;
  // Where in the manuscript the change lands ("Section 3.2, Fig. 4"), or "".
  manuscript_anchor: string;
}

export interface ImportedReviewResult {
  format: "imported_review";
  decision: ImportedDecision;
  editor_summary: string;
  reviewers: { label: string; summary: string }[];
  comments: ImportedComment[];
  // Ordered revision plan across all comments; refers to comment ids.
  strategy: string[];
  // The referee_reports document the comments were imported from.
  source_document_id: string;
}

export const IMPORTED_STANCE_LABELS: Record<ImportedCommentStance, string> = {
  agree_revise: "Agree & revise",
  clarify: "Clarify",
  partially_agree: "Partly agree",
  respectfully_disagree: "Respectfully disagree",
};

export const IMPORTED_EFFORT_LABELS: Record<ImportedCommentEffort, string> = {
  quick: "Quick fix",
  moderate: "New analysis",
  substantial: "New experiment",
};

/** Client-safe detection of an imported-review rubric. */
export function parseImportedReview(rubricJson: string | null): ImportedReviewResult | null {
  if (!rubricJson) return null;
  try {
    const parsed = JSON.parse(rubricJson) as Partial<ImportedReviewResult>;
    return parsed.format === "imported_review" && Array.isArray(parsed.comments)
      ? (parsed as ImportedReviewResult)
      : null;
  } catch {
    return null;
  }
}

export function isPeerReviewResult(review: ReviewResult): review is PeerReviewResult {
  return "format" in review && review.format === "peer_review";
}

// Contract implemented in run.ts:
//   runDocReview(documentId: string, opts: { provider: ProviderId; stageId?: string;
//       model?: string }, signal?: AbortSignal): Promise<ReportRow>
//     - loads the document text, runs a one-shot rubric review on the given
//       provider, persists and returns the report row.
