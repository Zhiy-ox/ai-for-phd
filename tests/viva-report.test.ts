import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { completeJsonWithRetry, extractFencedJson } from "@/lib/shared/json-extract";
import {
  ProviderCallError,
  type AuthStatus,
  type CompleteOnceRequest,
  type LLMProvider,
  type ProviderEvent,
} from "@/lib/providers/types";
import {
  DEFAULT_PROGRAMME_ID,
  getProgramme,
  getStage,
  hasLivePanel,
  hasWrittenPeerReview,
  listProgrammes,
} from "@/lib/template";
import { VIVA_COMPLETE_TOKEN, type QuestionPlan } from "@/lib/viva/types";
import {
  buildPanelSystemPrompt,
  parseSpeakerTag,
  stripVivaCompleteToken,
  VivaAssessmentSchema,
} from "@/lib/viva/prompts";
import {
  buildPeerReviewPrompt,
  DocReviewResultSchema,
  peerReviewResultSchemaForRubric,
  PeerReviewResultSchema,
} from "@/lib/review/prompts";

// Planner calls now update advisory quota memory, so keep its integration
// tests isolated from the owner's real local database.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "aiphd-planner-"));
const { generateQuestionPlan } = await import("@/lib/viva/planner");
const { startVivaSession } = await import("@/lib/viva/engine");
const { renderPeerReviewMarkdown } = await import("@/lib/review/run");
const { clearUsageLimit, recordUsageLimit, usageLimitedAt } = await import(
  "@/lib/providers/usage"
);

function fence(json: unknown): string {
  return "```json\n" + JSON.stringify(json, null, 2) + "\n```";
}

type StubProvider = LLMProvider & { calls: CompleteOnceRequest[] };

function stubProvider(responses: (string | Error)[]): StubProvider {
  const calls: CompleteOnceRequest[] = [];
  let i = 0;
  return {
    id: "claude",
    label: "Stub",
    calls,
     
    async *streamTurn(): AsyncGenerator<ProviderEvent> {
      throw new Error("streamTurn is not used in these tests");
    },
    async completeOnce(req: CompleteOnceRequest): Promise<string> {
      calls.push(req);
      const response = responses[Math.min(i, responses.length - 1)];
      i += 1;
      if (response instanceof Error) throw response;
      return response;
    },
    async checkAuth(): Promise<AuthStatus> {
      return { ok: true, detail: "stub" };
    },
  };
}

const validAssessment = {
  criteria: [
    { id: "originality", score: 4, comments: "Distinct contribution defended under pressure." },
    { id: "methodology", score: 3, comments: "Controls described only after prompting." },
  ],
  strengths: ["Commands the fabrication literature."],
  weaknesses: ["Vague about the error budget."],
  verdict: "approved",
  narrative_md: "The panel was satisfied that the project can grow into a doctorate.",
};

const validReview = {
  summary: "A promising report weakened by missing error analysis.",
  criteria: [{ id: "methodology", score: 3, comments: "No uncertainty quantification." }],
  sections: [
    {
      anchor_quote: "87% first-order diffraction efficiency",
      section_hint: "Results, gratings subsection",
      severity: "major",
      comment: "The headline number carries no error bar or repeat count.",
      suggestion: "Report mean and standard deviation over at least five fabricated gratings.",
    },
  ],
  top_actions: ["Add uncertainty analysis to every quantitative claim."],
};

const peerSection = (
  reviewer: "reviewer_1" | "reviewer_2" | "reviewer_3",
  severity: "minor" | "moderate" | "major",
  index: number,
) => ({
  reviewer,
  anchor_quote: `verbatim manuscript phrase ${reviewer} ${index}`,
  section_hint: `Section ${index}`,
  severity,
  comment: `Written comment ${index} from ${reviewer}.`,
  suggestion: `Revise section ${index} with specific evidence.`,
});

const validPeerReview = {
  format: "peer_review" as const,
  summary: "A potentially publishable paper with substantial technical revisions required.",
  recommendation: "major_revision" as const,
  criteria: [
    { id: "novelty", score: 2, comments: "The novelty case is incomplete." },
    { id: "soundness", score: 2, comments: "Controls are incomplete." },
    { id: "significance", score: 3, comments: "The field-level impact needs framing." },
    { id: "clarity", score: 3, comments: "The argument needs tightening." },
    { id: "reproducibility", score: 2, comments: "Reporting is not yet reproducible." },
  ],
  reviewer_summaries: {
    reviewer_1: "The methods are promising but need clearer reporting.",
    reviewer_2: "The central claims are not yet supported by the evidence presented.",
    reviewer_3: "The significance needs stronger framing against prior work.",
  },
  sections: [
    peerSection("reviewer_1", "moderate", 1),
    peerSection("reviewer_1", "moderate", 2),
    peerSection("reviewer_1", "minor", 3),
    peerSection("reviewer_2", "major", 1),
    peerSection("reviewer_2", "major", 2),
    peerSection("reviewer_2", "moderate", 3),
    peerSection("reviewer_3", "major", 1),
    peerSection("reviewer_3", "moderate", 2),
    peerSection("reviewer_3", "minor", 3),
  ],
  top_actions: [
    "Add the missing control experiment.",
    "Temper the novelty claim.",
    "Clarify the statistical analysis.",
  ],
};

describe("extractFencedJson", () => {
  it("parses a fenced json block", () => {
    expect(extractFencedJson('Sure!\n```json\n{"a": 1}\n```\nDone.')).toEqual({ a: 1 });
  });

  it("prefers the LAST fenced json block", () => {
    const text = '```json\n{"first": true}\n```\nActually, corrected:\n```json\n{"second": true}\n```';
    expect(extractFencedJson(text)).toEqual({ second: true });
  });

  it("falls back to a plain fenced block", () => {
    expect(extractFencedJson('```\n{"plain": 1}\n```')).toEqual({ plain: 1 });
  });

  it("falls back to balanced-brace matching in prose", () => {
    const text = 'Here is the plan {"a": {"b": [1, 2]}} — hope it helps.';
    expect(extractFencedJson(text)).toEqual({ a: { b: [1, 2] } });
  });

  it("handles braces and escapes inside strings", () => {
    const text = 'Result: {"s": "closing } inside", "t": "quote \\" and { brace"}';
    expect(extractFencedJson(text)).toEqual({ s: "closing } inside", t: 'quote " and { brace' });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => extractFencedJson("I am afraid I cannot produce JSON today.")).toThrow(/JSON/);
  });
});

describe("completeJsonWithRetry", () => {
  it("succeeds first try without a retry", async () => {
    const provider = stubProvider([fence(validAssessment)]);
    const result = await completeJsonWithRetry(
      provider,
      { systemPrompt: "sys", userMessage: "go" },
      VivaAssessmentSchema,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.verdict).toBe("approved");
    expect(provider.calls).toHaveLength(1);
  });

  it("retries once on bad JSON and parses the corrected VivaAssessment", async () => {
    const provider = stubProvider(["Certainly! Here are my thoughts, sans JSON.", fence(validAssessment)]);
    const result = await completeJsonWithRetry(
      provider,
      { systemPrompt: "sys", userMessage: "go" },
      VivaAssessmentSchema,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.criteria[0].id).toBe("originality");
      expect(result.value.strengths).toHaveLength(1);
    }
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].userMessage).toMatch(/invalid/i);
    expect(provider.calls[1].userMessage).toMatch(/re-emit/i);
  });

  it("retries once on schema-invalid DocReviewResult and accepts the fix", async () => {
    const broken = { ...validReview, sections: [{ ...validReview.sections[0], severity: "catastrophic" }] };
    const provider = stubProvider([fence(broken), fence(validReview)]);
    const result = await completeJsonWithRetry(
      provider,
      { systemPrompt: "sys", userMessage: "go" },
      DocReviewResultSchema,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sections[0].severity).toBe("major");
      expect(result.value.sections[0].anchor_quote).toBe("87% first-order diffraction efficiency");
    }
    expect(provider.calls).toHaveLength(2);
  });

  it("returns ok: false with the raw text after a second failure", async () => {
    const provider = stubProvider(["nope", "still nope"]);
    const result = await completeJsonWithRetry(
      provider,
      { systemPrompt: "sys", userMessage: "go" },
      VivaAssessmentSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rawText).toBe("still nope");
    expect(provider.calls).toHaveLength(2);
  });
});

describe("schema round-trips", () => {
  it("VivaAssessmentSchema accepts a valid assessment", () => {
    const parsed = VivaAssessmentSchema.parse(validAssessment);
    expect(parsed).toEqual(validAssessment);
  });

  it("VivaAssessmentSchema rejects out-of-range scores", () => {
    const bad = {
      ...validAssessment,
      criteria: [{ id: "originality", score: 7, comments: "too generous" }],
    };
    expect(VivaAssessmentSchema.safeParse(bad).success).toBe(false);
  });

  it("DocReviewResultSchema accepts a valid review", () => {
    const parsed = DocReviewResultSchema.parse(validReview);
    expect(parsed).toEqual(validReview);
  });

  it("DocReviewResultSchema rejects an unknown severity", () => {
    const bad = {
      ...validReview,
      sections: [{ ...validReview.sections[0], severity: "apocalyptic" }],
    };
    expect(DocReviewResultSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts exactly three written reviewers with Reviewer 2 most critical", () => {
    expect(PeerReviewResultSchema.parse(validPeerReview)).toEqual(validPeerReview);
  });

  it("rejects a peer review when one reviewer is missing", () => {
    const bad = {
      ...validPeerReview,
      sections: validPeerReview.sections.filter((section) => section.reviewer !== "reviewer_3"),
    };
    expect(PeerReviewResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a peer review when Reviewer 2 is not strictly the most critical", () => {
    const bad = {
      ...validPeerReview,
      sections: validPeerReview.sections.map((section) =>
        section.reviewer === "reviewer_2" && section.severity === "major"
          ? { ...section, severity: "moderate" as const }
          : section,
      ),
    };
    expect(PeerReviewResultSchema.safeParse(bad).success).toBe(false);
  });

  it("allows a strong manuscript without inventing a major concern for Reviewer 2", () => {
    const minorReview = {
      ...validPeerReview,
      recommendation: "minor_revision" as const,
      sections: [
        peerSection("reviewer_1", "minor", 1),
        peerSection("reviewer_1", "minor", 2),
        peerSection("reviewer_1", "minor", 3),
        peerSection("reviewer_2", "minor", 1),
        peerSection("reviewer_2", "minor", 2),
        peerSection("reviewer_2", "minor", 3),
        peerSection("reviewer_2", "minor", 4),
        peerSection("reviewer_3", "minor", 1),
        peerSection("reviewer_3", "minor", 2),
        peerSection("reviewer_3", "minor", 3),
      ],
    };
    expect(PeerReviewResultSchema.safeParse(minorReview).success).toBe(true);
  });

  it("requires every stage rubric criterion exactly once", () => {
    const stage = getStage(DEFAULT_PROGRAMME_ID, "papers");
    const schema = peerReviewResultSchemaForRubric(stage.assessment!.rubric);
    expect(schema.safeParse(validPeerReview).success).toBe(true);
    expect(
      schema.safeParse({ ...validPeerReview, criteria: validPeerReview.criteria.slice(0, -1) })
        .success,
    ).toBe(false);
  });
});

describe("written peer review", () => {
  const stage = getStage(DEFAULT_PROGRAMME_ID, "papers");

  it("marks papers as written review rather than a live panel", () => {
    for (const programme of listProgrammes()) {
      const paperStage = programme.stages.find((candidate) => candidate.id === "papers")!;
      expect(hasWrittenPeerReview(paperStage)).toBe(true);
      expect(hasLivePanel(paperStage)).toBe(false);
      expect(paperStage.assessment?.panel.map((reviewer) => reviewer.name)).toEqual([
        "Reviewer 1",
        "Reviewer 2",
        "Reviewer 3",
      ]);
      expect(paperStage.assessment?.panel[1].style).toMatch(/most hostile/i);
    }
  });

  it("fixes Reviewer 2 as the hostile reviewer in the one-shot prompt", () => {
    const prompt = buildPeerReviewPrompt({
      stage,
      rubric: stage.assessment!.rubric,
      docTitle: "manuscript.md",
      docText: "The manuscript claims a large improvement without a control measurement.",
    });
    expect(prompt.systemPrompt).toContain("asynchronous written peer review");
    expect(prompt.systemPrompt).toContain("Reviewer 2 — ALWAYS the most hostile");
    expect(prompt.systemPrompt).toContain("highest overall criticality");
    expect(prompt.systemPrompt).toContain("does not require inventing a major flaw");
    expect(prompt.systemPrompt).toContain("never a viva, interview, chat, or role-play");
  });

  it("renders three ordered, numbered reviewer sections", () => {
    const markdown = renderPeerReviewMarkdown(
      stage,
      stage.assessment!.rubric,
      "manuscript.md",
      validPeerReview,
    );
    expect(markdown.indexOf("## Reviewer 1")).toBeLessThan(
      markdown.indexOf("## Reviewer 2 — most hostile"),
    );
    expect(markdown.indexOf("## Reviewer 2 — most hostile")).toBeLessThan(
      markdown.indexOf("## Reviewer 3"),
    );
    expect(markdown).toContain("1. **Major — Section 1**");
    expect(markdown).toContain("**Suggested revision:**");
  });

  it("refuses to start a live session for papers", async () => {
    await expect(
      startVivaSession({ stageId: "papers", documentIds: [], mode: "drill" }),
    ).rejects.toThrow(/written reviewer comments/i);
  });
});

describe("generateQuestionPlan", () => {
  const stage = getStage(DEFAULT_PROGRAMME_ID, "transfer");
  const validPlan: QuestionPlan = {
    areas: [
      {
        rubricId: "methodology",
        title: "Fabrication rigor",
        seedQuestions: ["How exactly was the 87% efficiency measured?"],
        weakSpots: ["No error bars on the efficiency figure."],
      },
    ],
  };

  it("returns the plan after a bad-then-good retry", async () => {
    const provider = stubProvider(["not json, sorry", fence(validPlan)]);
    const plan = await generateQuestionPlan(provider, undefined, stage, "report text");
    expect(plan).toEqual(validPlan);
    expect(provider.calls).toHaveLength(2);
  });

  it("embeds the rubric ids and the report in the request", async () => {
    const provider = stubProvider([fence(validPlan)]);
    await generateQuestionPlan(provider, "some-model", stage, "The candidate measured gratings.");
    expect(provider.calls[0].systemPrompt).toContain('"originality"');
    expect(provider.calls[0].systemPrompt).toContain('"feasibility"');
    expect(provider.calls[0].userMessage).toContain("The candidate measured gratings.");
    expect(provider.calls[0].model).toBe("some-model");
  });

  it("returns undefined after two failures — the viva runs without a plan", async () => {
    const provider = stubProvider(["nope", "still nope"]);
    const plan = await generateQuestionPlan(provider, undefined, stage, "report text");
    expect(plan).toBeUndefined();
    expect(provider.calls).toHaveLength(2);
  });

  it("records and clears quota memory through the planner call path", async () => {
    recordUsageLimit("claude");
    await generateQuestionPlan(stubProvider([fence(validPlan)]), undefined, stage, "report text");
    expect(usageLimitedAt("claude")).toBeNull();

    const quotaError = new ProviderCallError("usage_limit", "window exhausted");
    await expect(
      generateQuestionPlan(stubProvider([quotaError]), undefined, stage, "report text"),
    ).rejects.toBe(quotaError);
    expect(usageLimitedAt("claude")).not.toBeNull();
    clearUsageLimit("claude");
  });
});

describe("stripVivaCompleteToken", () => {
  it("passes normal text through, trimmed and not concluded", () => {
    const result = stripVivaCompleteToken("  [Dr Chen] What is your control condition?  ");
    expect(result).toEqual({
      content: "[Dr Chen] What is your control condition?",
      concluded: false,
    });
  });

  it("strips the token from the final line and concludes", () => {
    const text = `[Prof Whitfield] Thank you, we will confer.\n${VIVA_COMPLETE_TOKEN}`;
    const result = stripVivaCompleteToken(text);
    expect(result.concluded).toBe(true);
    expect(result.content).toBe("[Prof Whitfield] Thank you, we will confer.");
    expect(result.content).not.toContain("viva-complete");
  });

  it("tolerates whitespace variants of the token", () => {
    const result = stripVivaCompleteToken("[Dr Chen] Closing remarks.\n<viva-complete />");
    expect(result.concluded).toBe(true);
    expect(result.content).toBe("[Dr Chen] Closing remarks.");
  });

  it("handles a token-only payload", () => {
    expect(stripVivaCompleteToken(VIVA_COMPLETE_TOKEN)).toEqual({ content: "", concluded: true });
  });
});

describe("parseSpeakerTag", () => {
  it("parses a leading [Dr Chen] tag", () => {
    expect(parseSpeakerTag("[Dr Chen] Walk me through your controls.")).toBe("Dr Chen");
  });

  it("ignores leading whitespace and newlines", () => {
    expect(parseSpeakerTag("\n  [Prof Whitfield]\nWhere does this sit in the field?")).toBe(
      "Prof Whitfield",
    );
  });

  it("returns undefined when there is no tag", () => {
    expect(parseSpeakerTag("Thank you for that answer.")).toBeUndefined();
  });

  it("does not match a tag later in the text", () => {
    expect(parseSpeakerTag("As I said, [Dr Chen] disagrees.")).toBeUndefined();
  });
});

describe("buildPanelSystemPrompt", () => {
  const programme = getProgramme(DEFAULT_PROGRAMME_ID);
  const stage = getStage(DEFAULT_PROGRAMME_ID, "transfer");
  const documents = [
    {
      title: "transfer-report.pdf",
      text: "We fabricated LC gratings reaching 87% first-order diffraction efficiency.",
    },
  ];
  const plan: QuestionPlan = {
    areas: [
      {
        rubricId: "methodology",
        title: "Fabrication rigor",
        seedQuestions: ["How was the 87% efficiency measured?"],
        weakSpots: ["No repeatability data."],
      },
    ],
  };

  it("includes the personas, rubric, document block, plan, and completion token", () => {
    const prompt = buildPanelSystemPrompt({ programme, stage, documents, plan });
    expect(prompt).toContain("[Dr Chen]");
    expect(prompt).toContain("[Prof Whitfield]");
    expect(prompt).toContain("Internal assessor");
    expect(prompt).toContain("Originality & significance");
    expect(prompt).toContain('<document title="transfer-report.pdf">');
    expect(prompt).toContain("87% first-order diffraction efficiency");
    expect(prompt).toContain("How was the 87% efficiency measured?");
    expect(prompt).toContain("No repeatability data.");
    expect(prompt).toContain(VIVA_COMPLETE_TOKEN);
    expect(prompt).toContain("EXACTLY ONE question per turn");
  });

  it("omits the plan section when no plan is given", () => {
    const prompt = buildPanelSystemPrompt({ programme, stage, documents });
    expect(prompt).not.toContain("Prepared question plan");
    expect(prompt).toContain("[Dr Chen]");
  });

  it("throws for a stage without an assessment block", () => {
    const prsStage = getStage(DEFAULT_PROGRAMME_ID, "prs-start");
    expect(() => buildPanelSystemPrompt({ programme, stage: prsStage, documents })).toThrow(
      /assessment/,
    );
  });

  it("swaps a persona's style for a chosen personality archetype, keeping name and role", () => {
    const prompt = buildPanelSystemPrompt({
      programme,
      stage,
      documents,
      style: { intensity: "standard", personas: { internal: "statistician" } },
    });
    // Dr Chen keeps their name/role but speaks as The Statistician…
    expect(prompt).toContain("[Dr Chen]");
    expect(prompt).toContain("Distrusts every number until shown its uncertainty");
    expect(prompt).not.toContain("Works through the report section by section");
    // …while the unoverridden persona stays as written.
    expect(prompt).toContain("Big-picture and comparative");
    // Unknown archetype ids fall back to the template persona.
    const fallback = buildPanelSystemPrompt({
      programme,
      stage,
      documents,
      style: { intensity: "standard", personas: { internal: "no-such-archetype" } },
    });
    expect(fallback).toContain("Works through the report section by section");
  });
});
