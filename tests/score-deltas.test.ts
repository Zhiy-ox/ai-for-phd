import { describe, expect, it } from "vitest";
import type { DocumentKind } from "@/lib/db/repos/documents";
import type { ReportRow, ReportType } from "@/lib/db/repos/reports";
import {
  findPreviousDocReview,
  type ReviewDocumentIdentity,
} from "@/lib/review/score-deltas";

function document(
  id: string,
  stageId: string | null = "transfer",
  kind: DocumentKind = "transfer_report",
): ReviewDocumentIdentity {
  return { id, stage_id: stageId, kind };
}

function report(args: {
  id: string;
  documentId: string | null;
  createdAt: string;
  type?: ReportType;
  rubricJson?: string | null;
}): ReportRow {
  return {
    id: args.id,
    session_id: null,
    document_id: args.documentId,
    type: args.type ?? "doc_review",
    verdict: null,
    rubric_json:
      args.rubricJson === undefined
        ? JSON.stringify({
            summary: "Synthetic review",
            criteria: [{ id: "originality", score: 3, comments: "Synthetic comment" }],
            sections: [],
            top_actions: [],
          })
        : args.rubricJson,
    content_md: "",
    created_at: args.createdAt,
  };
}

describe("findPreviousDocReview", () => {
  const currentDocument = document("current-doc");
  const currentReport = report({
    id: "current-report",
    documentId: currentDocument.id,
    createdAt: "2026-07-11T12:00:00.000Z",
  });

  it("selects the newest older review across documents with the same stage and kind", () => {
    const previous = findPreviousDocReview({
      currentReport,
      currentDocument,
      stageDocuments: [
        currentDocument,
        document("matching-doc"),
        document("other-stage", "confirmation"),
        document("other-kind", "transfer", "proposal"),
      ],
      reports: [
        report({
          id: "oldest-match",
          documentId: currentDocument.id,
          createdAt: "2026-07-08T12:00:00.000Z",
        }),
        report({
          id: "newest-match",
          documentId: "matching-doc",
          createdAt: "2026-07-10T12:00:00.000Z",
        }),
        report({
          id: "other-stage-report",
          documentId: "other-stage",
          createdAt: "2026-07-10T18:00:00.000Z",
        }),
        report({
          id: "other-kind-report",
          documentId: "other-kind",
          createdAt: "2026-07-10T19:00:00.000Z",
        }),
      ],
    });

    expect(previous?.id).toBe("newest-match");
  });

  it("excludes the current report, equal timestamps, newer reports, and non-reviews", () => {
    const previous = findPreviousDocReview({
      currentReport,
      currentDocument,
      stageDocuments: [currentDocument],
      reports: [
        currentReport,
        report({
          id: "same-time",
          documentId: currentDocument.id,
          createdAt: currentReport.created_at,
        }),
        report({
          id: "newer",
          documentId: currentDocument.id,
          createdAt: "2026-07-12T12:00:00.000Z",
        }),
        report({
          id: "viva",
          documentId: currentDocument.id,
          createdAt: "2026-07-10T12:00:00.000Z",
          type: "viva_assessment",
        }),
      ],
    });

    expect(previous).toBeNull();
  });

  it("recognises an older review of the current document when the stage list omits it", () => {
    const previous = findPreviousDocReview({
      currentReport,
      currentDocument,
      stageDocuments: [],
      reports: [
        report({
          id: "same-document",
          documentId: currentDocument.id,
          createdAt: "2026-07-10T12:00:00.000Z",
        }),
      ],
    });

    expect(previous?.id).toBe("same-document");
  });

  it("skips a failed newer attempt in favour of the newest usable review", () => {
    const previous = findPreviousDocReview({
      currentReport,
      currentDocument,
      stageDocuments: [currentDocument],
      reports: [
        report({
          id: "malformed-attempt",
          documentId: currentDocument.id,
          createdAt: "2026-07-10T20:00:00.000Z",
          rubricJson: "{not-json",
        }),
        report({
          id: "failed-attempt",
          documentId: currentDocument.id,
          createdAt: "2026-07-10T18:00:00.000Z",
          rubricJson: null,
        }),
        report({
          id: "usable-review",
          documentId: currentDocument.id,
          createdAt: "2026-07-10T12:00:00.000Z",
        }),
      ],
    });

    expect(previous?.id).toBe("usable-review");
  });

  it("matches unassigned documents only with other unassigned documents of the same kind", () => {
    const unassignedDocument = document("unassigned-current", null, "paper");
    const unassignedReport = report({
      id: "unassigned-current-report",
      documentId: unassignedDocument.id,
      createdAt: currentReport.created_at,
    });
    const previous = findPreviousDocReview({
      currentReport: unassignedReport,
      currentDocument: unassignedDocument,
      stageDocuments: [
        unassignedDocument,
        document("unassigned-match", null, "paper"),
        document("assigned-paper", "papers", "paper"),
        document("unassigned-thesis", null, "thesis"),
      ],
      reports: [
        report({
          id: "unassigned-match-report",
          documentId: "unassigned-match",
          createdAt: "2026-07-10T12:00:00.000Z",
        }),
        report({
          id: "assigned-report",
          documentId: "assigned-paper",
          createdAt: "2026-07-10T18:00:00.000Z",
        }),
        report({
          id: "wrong-kind-report",
          documentId: "unassigned-thesis",
          createdAt: "2026-07-10T19:00:00.000Z",
        }),
      ],
    });

    expect(previous?.id).toBe("unassigned-match-report");
  });
});
