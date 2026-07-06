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

export interface DocReviewResult {
  summary: string;
  criteria: { id: string; score: number; comments: string }[];
  sections: DocReviewSection[];
  top_actions: string[];
}

// Contract implemented in run.ts:
//   runDocReview(documentId: string, opts: { provider: ProviderId; stageId?: string;
//       model?: string }, signal?: AbortSignal): Promise<ReportRow>
//     - loads the document text, runs a one-shot rubric review on the given
//       provider, persists and returns the report row.
