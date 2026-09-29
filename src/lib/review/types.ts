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

export function isPeerReviewResult(review: ReviewResult): review is PeerReviewResult {
  return "format" in review && review.format === "peer_review";
}

// Contract implemented in run.ts:
//   runDocReview(documentId: string, opts: { provider: ProviderId; stageId?: string;
//       model?: string }, signal?: AbortSignal): Promise<ReportRow>
//     - loads the document text, runs a one-shot rubric review on the given
//       provider, persists and returns the report row.
