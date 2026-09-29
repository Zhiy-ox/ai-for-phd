import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerSpies = vi.hoisted(() => ({
  resolve: vi.fn(),
  get: vi.fn(),
  complete: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/providers/registry", () => ({
  resolveProviderAndModel: providerSpies.resolve,
  getProvider: providerSpies.get,
}));

vi.mock("@/lib/providers/usage-completion", () => ({
  completeJsonWithUsageTracking: providerSpies.complete,
}));

vi.mock("@/lib/providers/usage", () => ({
  trackStreamUsage: providerSpies.track,
}));

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "aiphd-programme-integrity-"));

const { insertDocument, updateExtraction } = await import("@/lib/db/repos/documents");
const { createSession, listMessages } = await import("@/lib/db/repos/sessions");
const { insertReport } = await import("@/lib/db/repos/reports");
const { listFindings } = await import("@/lib/db/repos/findings");
const { setSettings } = await import("@/lib/db/repos/settings");
const { runDocReview } = await import("@/lib/review/run");
const { draftRebuttalLetterFromReview, rebuttalLetterSchemaForReview } = await import(
  "@/lib/rebuttal/run"
);
const { startVivaSession, submitUtterance } = await import("@/lib/viva/engine");

function insertReadableDocument(programmeId: string, filename: string): string {
  const document = insertDocument({
    programmeId,
    filename,
    kind: "proposal",
    stageId: "transfer",
    filePath: `/tmp/${filename}`,
  });
  updateExtraction(document.id, { text: "Synthetic research text", charCount: 23 });
  return document.id;
}

function expectNoProviderOrQuotaWork(): void {
  expect(providerSpies.resolve).not.toHaveBeenCalled();
  expect(providerSpies.get).not.toHaveBeenCalled();
  expect(providerSpies.complete).not.toHaveBeenCalled();
  expect(providerSpies.track).not.toHaveBeenCalled();
}

function peerReviewFixture() {
  const section = (
    reviewer: "reviewer_1" | "reviewer_2" | "reviewer_3",
    severity: "minor" | "moderate" | "major",
    index: number,
  ) => ({
    reviewer,
    anchor_quote: `synthetic quote ${reviewer} ${index}`,
    section_hint: `Section ${index}`,
    severity,
    comment: `Comment ${index}`,
    suggestion: `Revision ${index}`,
  });
  return {
    format: "peer_review" as const,
    summary: "Synthetic editorial summary.",
    recommendation: "major_revision" as const,
    criteria: [
      { id: "novelty", score: 2, comments: "The novelty case is incomplete." },
      { id: "soundness", score: 2, comments: "Controls are incomplete." },
      { id: "significance", score: 3, comments: "The significance needs framing." },
      { id: "clarity", score: 3, comments: "The argument needs tightening." },
      { id: "reproducibility", score: 2, comments: "Reporting is incomplete." },
    ],
    reviewer_summaries: {
      reviewer_1: "Constructive methods review.",
      reviewer_2: "Hostile technical review.",
      reviewer_3: "Field-positioning review.",
    },
    sections: [
      section("reviewer_1", "moderate", 1),
      section("reviewer_1", "moderate", 2),
      section("reviewer_1", "minor", 3),
      section("reviewer_2", "major", 1),
      section("reviewer_2", "major", 2),
      section("reviewer_2", "moderate", 3),
      section("reviewer_3", "major", 1),
      section("reviewer_3", "moderate", 2),
      section("reviewer_3", "minor", 3),
    ],
    top_actions: ["Add controls.", "Temper claims.", "Clarify statistics."],
  };
}

beforeEach(() => {
  providerSpies.resolve.mockReset();
  providerSpies.get.mockReset();
  providerSpies.complete.mockReset();
  providerSpies.track.mockReset();
  setSettings({ programme_id: "oxford-dphil" });
});

describe("programme document boundaries", () => {
  it("rejects a cross-programme review before resolving or calling a provider", async () => {
    const documentId = insertReadableDocument("generic-uk-phd", "generic-review.md");

    await expect(
      runDocReview(documentId, { provider: "codex", stageId: "transfer" }),
    ).rejects.toThrow(
      'Document "generic-review.md" belongs to programme "generic-uk-phd", not the active programme "oxford-dphil"',
    );

    expectNoProviderOrQuotaWork();
  });

  it("rejects cross-programme viva documents before provider resolution or planning", async () => {
    const documentId = insertReadableDocument("generic-uk-phd", "generic-viva.md");

    await expect(
      startVivaSession({
        stageId: "transfer",
        provider: "codex",
        documentIds: [documentId],
      }),
    ).rejects.toThrow(
      'Document "generic-viva.md" belongs to programme "generic-uk-phd", not this session\'s programme "oxford-dphil"',
    );

    expectNoProviderOrQuotaWork();
  });

  it("validates playback documents against config.programmeId before streaming", async () => {
    const documentId = insertReadableDocument("generic-uk-phd", "generic-playback.md");
    const session = createSession({
      // Deliberately disagree with config to prove playback trusts the
      // programme captured in the immutable session configuration.
      programmeId: "generic-uk-phd",
      type: "viva",
      stageId: "transfer",
      provider: "codex",
      config: {
        programmeId: "oxford-dphil",
        stageId: "transfer",
        provider: "codex",
        documentIds: [documentId],
      },
    });

    const events = [];
    for await (const event of submitUtterance(session.id, "")) events.push(event);

    expect(events).toEqual([
      {
        type: "error",
        code: "unknown",
        message:
          'Document "generic-playback.md" belongs to programme "generic-uk-phd", not this session\'s programme "oxford-dphil". Switch programmes or choose a document from the current programme.',
      },
    ]);
    expect(listMessages(session.id)).toHaveLength(0);
    expectNoProviderOrQuotaWork();
  });

  it("keeps legacy paper sessions read-only", async () => {
    const session = createSession({
      programmeId: "oxford-dphil",
      type: "viva",
      stageId: "papers",
      provider: "codex",
      config: {
        programmeId: "oxford-dphil",
        stageId: "papers",
        provider: "codex",
        documentIds: [],
      },
    });

    const events = [];
    for await (const event of submitUtterance(session.id, "Continue the role-play.")) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        code: "session_ended",
        message:
          "This legacy paper session is read-only. Open Reviewer comments to receive written feedback.",
      },
    ]);
    expect(listMessages(session.id)).toHaveLength(0);
    expectNoProviderOrQuotaWork();
  });
});

describe("written peer-review execution", () => {
  it("persists the three-reviewer packet and reviewer-labelled findings", async () => {
    const manuscript = insertDocument({
      programmeId: "oxford-dphil",
      filename: "peer-review-manuscript.md",
      kind: "paper",
      stageId: "papers",
      filePath: "/tmp/peer-review-manuscript.md",
    });
    updateExtraction(manuscript.id, {
      text: "Synthetic manuscript text for an isolated peer-review test.",
      charCount: 59,
    });
    const peerReview = peerReviewFixture();
    providerSpies.resolve.mockReturnValue({ provider: { id: "codex" }, model: "test-model" });
    providerSpies.complete.mockResolvedValue({ ok: true, value: peerReview });

    const report = await runDocReview(manuscript.id, {
      provider: "codex",
      stageId: "papers",
    });

    expect(report.verdict).toBe("major_revision");
    expect(JSON.parse(report.rubric_json!).format).toBe("peer_review");
    expect(report.content_md.indexOf("## Reviewer 1")).toBeLessThan(
      report.content_md.indexOf("## Reviewer 2 — most hostile"),
    );
    expect(report.content_md.indexOf("## Reviewer 2 — most hostile")).toBeLessThan(
      report.content_md.indexOf("## Reviewer 3"),
    );
    const findings = listFindings({ programmeId: "oxford-dphil", stageId: "papers" }).filter(
      (finding) => finding.source_id === report.id,
    );
    expect(findings).toHaveLength(7);
    expect(findings.some((finding) => finding.description.startsWith("Reviewer 2:"))).toBe(true);
    expect(providerSpies.complete.mock.calls[0][1].systemPrompt).toContain(
      "asynchronous written peer review",
    );
  });

  it("rejects supporting files before resolving a provider", async () => {
    const supporting = insertDocument({
      programmeId: "oxford-dphil",
      filename: "external-review.txt",
      kind: "referee_reports",
      stageId: "papers",
      filePath: "/tmp/external-review.txt",
    });
    updateExtraction(supporting.id, { text: "Reviewer comments", charCount: 17 });

    await expect(
      runDocReview(supporting.id, { provider: "codex", stageId: "papers" }),
    ).rejects.toThrow(/only be generated from a paper or manuscript/i);
    expectNoProviderOrQuotaWork();
  });
});

describe("written-review rebuttal drafting", () => {
  it("drafts an editable response directly from the three-reviewer packet", async () => {
    const manuscript = insertDocument({
      programmeId: "oxford-dphil",
      filename: "synthetic-manuscript.md",
      kind: "paper",
      stageId: "papers",
      filePath: "/tmp/synthetic-manuscript.md",
    });
    updateExtraction(manuscript.id, {
      text: "Synthetic manuscript text with no personal research data.",
      charCount: 53,
    });
    const peerReview = peerReviewFixture();
    const review = insertReport({
      documentId: manuscript.id,
      type: "doc_review",
      verdict: "major_revision",
      rubric: peerReview,
      contentMd: "# Peer review comments\n\n## Reviewer 1\n\nSynthetic comments.",
    });
    providerSpies.resolve.mockReturnValue({ provider: { id: "codex" }, model: "test-model" });
    const points = peerReview.sections.map((section, index) => {
      const reviewerNumber = section.reviewer.slice(-1);
      const reviewerIndex = peerReview.sections
        .slice(0, index + 1)
        .filter((candidate) => candidate.reviewer === section.reviewer).length;
      return {
        source: `Reviewer ${reviewerNumber}, comment ${reviewerNumber}.${reviewerIndex}`,
        quote: section.comment,
        response: "We agree and will address this point explicitly.",
        action: section.suggestion,
        location: section.section_hint,
      };
    });
    providerSpies.complete.mockResolvedValue({
      ok: true,
      value: {
        preamble: "We thank the reviewers for their careful comments.",
        points,
        closing: "We believe these changes strengthen the manuscript.",
      },
    });

    const response = await draftRebuttalLetterFromReview(review.id, { provider: "codex" });

    expect(response.type).toBe("rebuttal_letter");
    expect(response.document_id).toBe(manuscript.id);
    expect(response.content_md).toContain("# Response to Reviewers");
    expect(JSON.parse(response.rubric_json!).source_review_id).toBe(review.id);
    expect(points).toHaveLength(9);
    expect(providerSpies.complete).toHaveBeenCalledTimes(1);
    expect(providerSpies.complete.mock.calls[0][1].userMessage).toContain(
      "<written_peer_review>",
    );
    const responseSchema = providerSpies.complete.mock.calls[0][2];
    expect(
      responseSchema.safeParse({
        preamble: "Thanks.",
        points: points.slice(0, 1),
        closing: "Done.",
      }).success,
    ).toBe(false);

    const duplicate = await draftRebuttalLetterFromReview(review.id, { provider: "codex" });
    expect(duplicate.id).toBe(response.id);
    expect(providerSpies.complete).toHaveBeenCalledTimes(1);
  });

  it("lets a failed draft be retried instead of returning it forever", async () => {
    const manuscript = insertDocument({
      programmeId: "oxford-dphil",
      filename: "retry-manuscript.md",
      kind: "paper",
      stageId: "papers",
      filePath: "/tmp/retry-manuscript.md",
    });
    updateExtraction(manuscript.id, { text: "Synthetic manuscript text.", charCount: 26 });
    const peerReview = peerReviewFixture();
    const review = insertReport({
      documentId: manuscript.id,
      type: "doc_review",
      verdict: "major_revision",
      rubric: peerReview,
      contentMd: "# Peer review comments",
    });
    providerSpies.resolve.mockReturnValue({ provider: { id: "codex" }, model: "test-model" });
    providerSpies.complete.mockResolvedValueOnce({ ok: false, rawText: "unparseable draft" });

    const failed = await draftRebuttalLetterFromReview(review.id, { provider: "codex" });
    expect(failed.content_md).toBe("unparseable draft");
    // The failed draft still points back at its review for navigation.
    expect(JSON.parse(failed.rubric_json!).source_review_id).toBe(review.id);

    const points = peerReview.sections.map((section, index) => {
      const n = section.reviewer.slice(-1);
      const k = peerReview.sections
        .slice(0, index + 1)
        .filter((candidate) => candidate.reviewer === section.reviewer).length;
      return {
        source: `Reviewer ${n}, comment ${n}.${k}`,
        quote: section.comment,
        response: "We agree.",
        action: section.suggestion,
        location: section.section_hint,
      };
    });
    providerSpies.complete.mockResolvedValueOnce({
      ok: true,
      value: { preamble: "Thanks.", points, closing: "Done." },
    });

    const retried = await draftRebuttalLetterFromReview(review.id, { provider: "codex" });
    expect(retried.id).not.toBe(failed.id);
    expect(retried.content_md).toContain("# Response to Reviewers");
    expect(providerSpies.complete).toHaveBeenCalledTimes(2);
  });

  it("requires one ordered response for every numbered reviewer comment", () => {
    const review = peerReviewFixture();
    const schema = rebuttalLetterSchemaForReview(review);
    expect(
      schema.safeParse({
        preamble: "Thank you.",
        points: [
          {
            source: "Reviewer 1, comment 1.1",
            quote: "One point.",
            response: "One response.",
            action: "One change.",
            location: "Methods",
          },
        ],
        closing: "Thank you.",
      }).success,
    ).toBe(false);
  });
});
