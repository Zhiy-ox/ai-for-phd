import type { DocumentKind } from "@/lib/db/repos/documents";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { DocReviewResult } from "@/lib/review/types";

export interface ReviewDocumentIdentity {
  id: string;
  stage_id: string | null;
  kind: DocumentKind;
}

export function parseDocReviewResult(report: ReportRow): DocReviewResult | null {
  if (!report.rubric_json) return null;
  try {
    const parsed = JSON.parse(report.rubric_json) as DocReviewResult;
    return parsed && Array.isArray(parsed.criteria) ? parsed : null;
  } catch {
    return null;
  }
}

export function findPreviousDocReview(args: {
  currentReport: ReportRow;
  currentDocument: ReviewDocumentIdentity;
  stageDocuments: readonly ReviewDocumentIdentity[];
  reports: readonly ReportRow[];
}): ReportRow | null {
  const { currentReport, currentDocument, stageDocuments, reports } = args;
  const currentCreatedAt = Date.parse(currentReport.created_at);
  if (!Number.isFinite(currentCreatedAt)) return null;

  const matchingDocumentIds = new Set(
    stageDocuments
      .filter(
        (document) =>
          document.stage_id === currentDocument.stage_id && document.kind === currentDocument.kind,
      )
      .map((document) => document.id),
  );
  matchingDocumentIds.add(currentDocument.id);

  let previous: ReportRow | null = null;
  let previousCreatedAt = Number.NEGATIVE_INFINITY;
  for (const report of reports) {
    if (
      report.id === currentReport.id ||
      report.type !== "doc_review" ||
      !report.document_id ||
      !matchingDocumentIds.has(report.document_id) ||
      !parseDocReviewResult(report)
    ) {
      continue;
    }
    const createdAt = Date.parse(report.created_at);
    if (createdAt < currentCreatedAt && createdAt > previousCreatedAt) {
      previous = report;
      previousCreatedAt = createdAt;
    }
  }
  return previous;
}
