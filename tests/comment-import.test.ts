// Importing REAL reviewer comments: verbatim enforcement, input validation
// before any provider work, persistence + ledger seeding, and the zero-call
// response letter assembled from the per-comment drafts.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerSpies = vi.hoisted(() => ({
  resolve: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("@/lib/providers/registry", () => ({
  resolveProviderAndModel: providerSpies.resolve,
  getProvider: vi.fn(),
}));

vi.mock("@/lib/providers/usage-completion", () => ({
  completeJsonWithUsageTracking: providerSpies.complete,
}));

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "aiphd-comment-import-"));

const { insertDocument, updateExtraction, getDocument, listDocuments } = await import(
  "@/lib/db/repos/documents"
);
const { listFindings } = await import("@/lib/db/repos/findings");
const { setSettings } = await import("@/lib/db/repos/settings");
const { getStageActivity } = await import("@/lib/db/repos/stage-activity");
const {
  CommentImportError,
  buildImportPrompt,
  importReviewerComments,
  importedReviewSchemaFor,
  isVerbatimFrom,
  normalizeForMatch,
} = await import("@/lib/rebuttal/import");
const { draftRebuttalLetterFromReview } = await import("@/lib/rebuttal/run");
const { parseImportedReview } = await import("@/lib/review/types");
const { getStage } = await import("@/lib/template");

const LETTER = `Dear Dr Xu,

Your manuscript requires major revision.

Reviewer #1:
1. The authors claim a diffraction efficiency of 87%, but no error bars or repeat
   measurements are reported.
2. Please cite recent work on two-photon written liquid-crystal gratings.

Reviewer #2:
1. The novelty over planar photo-alignment is not demonstrated.`;

function insertManuscript(programmeId = "oxford-dphil", kind: "paper" | "proposal" = "paper") {
  const doc = insertDocument({
    programmeId,
    filename: "synthetic-manuscript.md",
    kind,
    stageId: "papers",
    filePath: "/tmp/synthetic-manuscript.md",
  });
  updateExtraction(doc.id, { text: "Synthetic manuscript about LC gratings.", charCount: 38 });
  return doc.id;
}

function modelImport() {
  return {
    decision: "major_revision" as const,
    editor_summary: "The reviewers want stronger evidence and clearer novelty.",
    reviewers: [
      { label: "Reviewer #1", summary: "Constructive; asks for statistics and citations." },
      { label: "Reviewer #2", summary: "Sceptical about novelty." },
    ],
    comments: [
      {
        id: "R1.1",
        reviewer: "Reviewer #1",
        text: "The authors claim a diffraction efficiency of 87%, but no error bars or repeat measurements are reported.",
        category: "major" as const,
        stance: "agree_revise" as const,
        suggestion: "Report the spread over repeat samples.",
        actions: ["Measure 5 samples", "Add error bars to Fig. 3"],
        draft_response: "We now report the mean over [ADD: n] samples.",
        effort: "moderate" as const,
        manuscript_anchor: "Fig. 3",
      },
      {
        id: "R1.2",
        reviewer: "Reviewer #1",
        text: "Please cite recent work on two-photon written liquid-crystal gratings.",
        category: "editorial" as const,
        stance: "agree_revise" as const,
        suggestion: "Add the missing references.",
        actions: ["Add citations to the introduction"],
        draft_response: "We have added the suggested references.",
        effort: "quick" as const,
        manuscript_anchor: "Introduction",
      },
      {
        id: "R2.1",
        reviewer: "Reviewer #2",
        text: "The novelty over planar photo-alignment is not demonstrated.",
        category: "major" as const,
        stance: "clarify" as const,
        suggestion: "Make the 3D director control explicit.",
        actions: [],
        draft_response: "Section 2 shows out-of-plane control; we now state this up front.",
        effort: "quick" as const,
        manuscript_anchor: "Section 2",
      },
    ],
    strategy: ["Fix R1.1 first.", "R2.1 is a framing fix."],
  };
}

function expectNoProviderWork() {
  expect(providerSpies.resolve).not.toHaveBeenCalled();
  expect(providerSpies.complete).not.toHaveBeenCalled();
}

beforeEach(() => {
  providerSpies.resolve.mockReset();
  providerSpies.complete.mockReset();
  providerSpies.resolve.mockReturnValue({ provider: { id: "codex" }, model: "test-model" });
  setSettings({ programme_id: "oxford-dphil" });
});

describe("verbatim matching", () => {
  it("ignores case, punctuation, and PDF line breaks", () => {
    const letter = normalizeForMatch(LETTER);
    expect(
      isVerbatimFrom(
        "the authors claim a diffraction efficiency of 87% — but no error bars or repeat measurements are reported",
        letter,
      ),
    ).toBe(true);
  });

  it("rejects a paraphrase", () => {
    const letter = normalizeForMatch(LETTER);
    expect(isVerbatimFrom("Error bars are missing from the efficiency figure.", letter)).toBe(false);
    expect(isVerbatimFrom("   ", letter)).toBe(false);
  });

  it("schema rejects paraphrased and duplicate comments", () => {
    const schema = importedReviewSchemaFor(LETTER);
    expect(schema.safeParse(modelImport()).success).toBe(true);

    const paraphrased = modelImport();
    paraphrased.comments[0].text = "Error bars are missing.";
    const result = schema.safeParse(paraphrased);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("R1.1");

    const duplicated = modelImport();
    duplicated.comments[1].id = "R1.1";
    expect(schema.safeParse(duplicated).success).toBe(false);
  });
});

describe("importReviewerComments", () => {
  it("rejects bad input before any provider work", async () => {
    const manuscriptId = insertManuscript();
    const cases: [Parameters<typeof importReviewerComments>[0], number][] = [
      [{ manuscriptId: "missing", text: LETTER }, 404],
      [{ manuscriptId }, 400],
      [{ manuscriptId, text: "   " }, 400],
      [{ manuscriptId, text: "x".repeat(60_001) }, 400],
      [{ manuscriptId: insertManuscript("oxford-dphil", "proposal"), text: LETTER }, 400],
      [{ manuscriptId: insertManuscript("generic-uk-phd"), text: LETTER }, 409],
      [{ manuscriptId, commentsDocumentId: manuscriptId }, 400],
    ];
    for (const [args, status] of cases) {
      const err = await importReviewerComments(args).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CommentImportError);
      expect((err as InstanceType<typeof CommentImportError>).status).toBe(status);
    }
    expectNoProviderWork();
  });

  it("saves the pasted letter, stores the plan, and seeds major comments", async () => {
    const manuscriptId = insertManuscript();
    providerSpies.complete.mockResolvedValue({ ok: true, value: modelImport(), rawText: "" });

    const report = await importReviewerComments({ manuscriptId, text: LETTER });

    const review = parseImportedReview(report.rubric_json)!;
    expect(review.format).toBe("imported_review");
    expect(report.verdict).toBe("major_revision");
    expect(report.document_id).toBe(manuscriptId);
    expect(report.content_md).toContain("> The authors claim a diffraction efficiency");

    const letterDoc = getDocument(review.source_document_id)!;
    expect(letterDoc.kind).toBe("referee_reports");
    expect(letterDoc.extracted_text).toBe(LETTER);

    const findings = listFindings({ programmeId: "oxford-dphil", stageId: "papers" }).filter(
      (f) => f.source_id === report.id,
    );
    expect(findings.map((f) => f.description)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Reviewer #1 (R1.1)"),
        expect.stringContaining("Reviewer #2 (R2.1)"),
      ]),
    );
    expect(findings).toHaveLength(2);

    const { userMessage, systemPrompt } = providerSpies.complete.mock.calls[0][1];
    expect(userMessage).toContain("<decision_letter>");
    expect(systemPrompt).toContain("VERBATIM");

    // It counts as "reviewer comments received" on the stage stepper.
    expect(getStageActivity("oxford-dphil", "papers").reviews).toBeGreaterThan(0);
  });

  it("reuses an uploaded referee-reports file", async () => {
    const manuscriptId = insertManuscript();
    const letter = insertDocument({
      programmeId: "oxford-dphil",
      filename: "decision-letter.txt",
      kind: "referee_reports",
      stageId: "papers",
      filePath: "/tmp/decision-letter.txt",
    });
    updateExtraction(letter.id, { text: LETTER, charCount: LETTER.length });
    providerSpies.complete.mockResolvedValue({ ok: true, value: modelImport(), rawText: "" });
    const before = listDocuments({ kind: "referee_reports" }).length;

    const report = await importReviewerComments({ manuscriptId, commentsDocumentId: letter.id });

    expect(parseImportedReview(report.rubric_json)!.source_document_id).toBe(letter.id);
    expect(listDocuments({ kind: "referee_reports" })).toHaveLength(before);
  });

  it("reports an unparseable model reply as 502 and keeps the letter", async () => {
    const manuscriptId = insertManuscript();
    providerSpies.complete.mockResolvedValue({ ok: false, rawText: "nonsense", error: "bad json" });
    const before = listDocuments({ kind: "referee_reports" }).length;

    const err = await importReviewerComments({ manuscriptId, text: LETTER }).catch((e: unknown) => e);

    expect((err as InstanceType<typeof CommentImportError>).status).toBe(502);
    expect(listDocuments({ kind: "referee_reports" })).toHaveLength(before + 1);
  });
});

describe("response letter from imported comments", () => {
  it("assembles it from the drafts without another AI call, once", async () => {
    const manuscriptId = insertManuscript();
    providerSpies.complete.mockResolvedValue({ ok: true, value: modelImport(), rawText: "" });
    const imported = await importReviewerComments({ manuscriptId, text: LETTER });
    providerSpies.complete.mockReset();
    providerSpies.resolve.mockReset();

    const letter = await draftRebuttalLetterFromReview(imported.id);

    expectNoProviderWork();
    const rubric = JSON.parse(letter.rubric_json!);
    expect(rubric.source_review_id).toBe(imported.id);
    expect(rubric.points).toHaveLength(3);
    expect(rubric.points[0].source).toBe("Reviewer #1, comment R1.1");
    expect(rubric.points[2].action).toBe("None");
    expect(letter.content_md).toContain("We now report the mean over [ADD: n] samples.");

    const again = await draftRebuttalLetterFromReview(imported.id);
    expect(again.id).toBe(letter.id);
  });
});

describe("buildImportPrompt", () => {
  it("frames the task around the real letter", () => {
    const { systemPrompt, userMessage } = buildImportPrompt({
      stage: getStage("oxford-dphil", "papers"),
      manuscriptTitle: 'my "paper".md',
      manuscriptText: "Manuscript body",
      letterText: LETTER,
    });
    expect(systemPrompt).toContain("NEVER invent results");
    expect(userMessage).toContain(`<manuscript title="my 'paper'.md">`);
    expect(userMessage).toContain("Reviewer #2:");
  });
});
