// Client-safe reading of a rebuttal_letter report's rubric_json. Shared by
// the drafter (server) and the report page so both agree on which letters
// count as finished.

export interface ResponseLetterMeta {
  // The peer-review report this letter answers, when drafted from one.
  sourceReviewId: string | null;
  // False for a failed draft (model output never validated): it keeps the
  // raw text for the user to read, but must not block a fresh attempt.
  complete: boolean;
}

export function responseLetterMeta(rubricJson: string | null): ResponseLetterMeta {
  if (!rubricJson) return { sourceReviewId: null, complete: false };
  try {
    const parsed = JSON.parse(rubricJson) as { source_review_id?: unknown; points?: unknown };
    return {
      sourceReviewId: typeof parsed.source_review_id === "string" ? parsed.source_review_id : null,
      complete: Array.isArray(parsed.points) && parsed.points.length > 0,
    };
  } catch {
    return { sourceReviewId: null, complete: false };
  }
}
