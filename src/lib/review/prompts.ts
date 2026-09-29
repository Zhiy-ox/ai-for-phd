// Prompt engineering + output schema for the one-shot rubric-based document
// review. The anchor_quote convention is load-bearing: the UI matches these
// snippets character-for-character against the extracted text.
import { z } from "zod";
import type { RubricCriterion, StageTemplate } from "@/lib/template";
import type { DocReviewResult, PeerReviewResult } from "./types";

const MAX_DOC_CHARS = 150_000;

export const DocReviewResultSchema: z.ZodType<DocReviewResult> = z.object({
  summary: z.string(),
  criteria: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().min(1).max(5),
        comments: z.string(),
      }),
    )
    .min(1),
  sections: z
    .array(
      z.object({
        anchor_quote: z.string(),
        section_hint: z.string(),
        severity: z.enum(["minor", "moderate", "major"]),
        comment: z.string(),
        suggestion: z.string(),
      }),
    )
    .min(1),
  top_actions: z.array(z.string()).min(1),
});

const PeerReviewSectionSchema = z.object({
  reviewer: z.enum(["reviewer_1", "reviewer_2", "reviewer_3"]),
  anchor_quote: z.string(),
  section_hint: z.string(),
  severity: z.enum(["minor", "moderate", "major"]),
  comment: z.string(),
  suggestion: z.string(),
});

export const PeerReviewResultSchema: z.ZodType<PeerReviewResult> = z
  .object({
    format: z.literal("peer_review"),
    summary: z.string(),
    recommendation: z.enum(["accept", "minor_revision", "major_revision", "reject"]),
    criteria: z
      .array(
        z.object({
          id: z.string(),
          score: z.number().min(1).max(5),
          comments: z.string(),
        }),
      )
      .min(1),
    reviewer_summaries: z.object({
      reviewer_1: z.string(),
      reviewer_2: z.string(),
      reviewer_3: z.string(),
    }),
    sections: z.array(PeerReviewSectionSchema).min(9).max(18),
    top_actions: z.array(z.string()).min(3).max(7),
  })
  .superRefine((review, ctx) => {
    const byReviewer = {
      reviewer_1: review.sections.filter((section) => section.reviewer === "reviewer_1"),
      reviewer_2: review.sections.filter((section) => section.reviewer === "reviewer_2"),
      reviewer_3: review.sections.filter((section) => section.reviewer === "reviewer_3"),
    };
    for (const [reviewer, sections] of Object.entries(byReviewer)) {
      if (sections.length < 3) {
        ctx.addIssue({
          code: "custom",
          message: `${reviewer} must provide at least three comments`,
          path: ["sections"],
        });
      }
    }
    if (new Set(review.criteria.map((criterion) => criterion.id)).size !== review.criteria.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each rubric criterion must appear exactly once",
        path: ["criteria"],
      });
    }
    const severityWeight = { minor: 1, moderate: 2, major: 3 } as const;
    const criticality = (sections: PeerReviewResult["sections"]) =>
      sections.reduce((total, section) => total + severityWeight[section.severity], 0);
    const reviewer2Criticality = criticality(byReviewer.reviewer_2);
    if (
      reviewer2Criticality <= criticality(byReviewer.reviewer_1) ||
      reviewer2Criticality <= criticality(byReviewer.reviewer_3)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Reviewer 2 must have a strictly higher severity-weighted criticality score than Reviewer 1 and Reviewer 3",
        path: ["sections"],
      });
    }
  });

export function peerReviewResultSchemaForRubric(
  rubric: RubricCriterion[],
): z.ZodType<PeerReviewResult> {
  const expectedIds = rubric.map((criterion) => criterion.id);
  const expectedSet = new Set(expectedIds);
  return PeerReviewResultSchema.superRefine((review, ctx) => {
    const actualIds = review.criteria.map((criterion) => criterion.id);
    if (
      actualIds.length !== expectedIds.length ||
      actualIds.some((id) => !expectedSet.has(id))
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Criteria must contain every rubric id exactly once: ${expectedIds.join(", ")}`,
        path: ["criteria"],
      });
    }
  });
}

function reviewPromptContext(stage: StageTemplate, rubric: RubricCriterion[]) {
  const rubricLines = rubric
    .map((c) => `- "${c.id}" — ${c.title} (weight ${c.weight}): ${c.description}`)
    .join("\n");
  const rubricIds = rubric.map((c) => `"${c.id}"`).join(", ");
  return { rubricLines, rubricIds };
}

function clippedDocument(docText: string): string {
  return docText.length <= MAX_DOC_CHARS
    ? docText
    : `${docText.slice(0, MAX_DOC_CHARS)}\n[... document truncated for length ...]`;
}

function documentMessage(docTitle: string, docText: string, instruction: string): string {
  return [
    "Here is the manuscript to review:",
    "",
    `<document title="${docTitle.replace(/"/g, "'")}">`,
    clippedDocument(docText),
    "</document>",
    "",
    instruction,
  ].join("\n");
}

export function buildPeerReviewPrompt(args: {
  stage: StageTemplate;
  rubric: RubricCriterion[];
  docTitle: string;
  docText: string;
}): { systemPrompt: string; userMessage: string } {
  const { stage, rubric, docTitle, docText } = args;
  const { rubricLines, rubricIds } = reviewPromptContext(stage, rubric);
  const systemPrompt = [
    `You are the editorial office of a selective peer-reviewed journal returning written referee reports on the submitted manuscript for ${stage.title}. This is asynchronous written peer review, never a viva, interview, chat, or role-play. Write the comments an author would actually receive: numbered, evidence-grounded, and actionable. Do not ask the author to answer now and do not write conversational follow-up questions.`,
    "",
    "# Fixed reviewer panel",
    "- Reviewer 1 — rigorous and constructive. Concentrates on methods, reproducibility, controls, and presentation. Acknowledges strengths and asks for proportionate revisions.",
    "- Reviewer 2 — ALWAYS the most hostile and sceptical reviewer. Attacks the weakest claims first, especially novelty, technical soundness, missing controls, statistics, overclaiming, and unsupported interpretation. Reviewer 2 must have the highest overall criticality (severity weights: major 3, moderate 2, minor 1), whether through stronger or more numerous comments. The tone is terse and exacting, but professional rather than abusive.",
    "- Reviewer 3 — broad field perspective. Concentrates on significance, literature positioning, readership, framing, figures, and clarity. Constructive but independent of Reviewer 1.",
    "",
    "# Rubric",
    rubricLines,
    "",
    "Scoring guide (editorial synthesis only): 5 = publication-ready; 4 = good, minor gaps; 3 = viable after meaningful revision; 2 = major scientific concerns; 1 = fundamentally unsupported.",
    "",
    "# Required report",
    '- Set "format" to exactly "peer_review".',
    '- "summary": one short editorial paragraph synthesising the paper, its strongest contribution, and the principal publication risk.',
    '- "recommendation": exactly one of "accept", "minor_revision", "major_revision", or "reject".',
    `- "criteria": score EVERY rubric criterion exactly once (ids: ${rubricIds}) with a 1–5 score and evidence-based editorial comment.`,
    '- "reviewer_summaries": one concise opening paragraph for each fixed key: "reviewer_1", "reviewer_2", and "reviewer_3".',
    '- "sections": 9–18 discrete written comments total, with at least 3 comments from each reviewer. Keep each reviewer\'s comments in manuscript order. Every entry contains:',
    '  - "reviewer": exactly "reviewer_1", "reviewer_2", or "reviewer_3".',
    '  - "anchor_quote": a VERBATIM contiguous snippet of AT MOST 20 words copied CHARACTER-FOR-CHARACTER from the manuscript. No paraphrase or ellipsis.',
    '  - "section_hint": the manuscript location.',
    '  - "severity": "major", "moderate", or "minor". Reviewer 2 must have a strictly higher severity-weighted criticality score than Reviewer 1 and Reviewer 3.',
    '  - "comment": the referee\'s written criticism or praise and why it matters. Phrase it as a report comment, not a live question.',
    '  - "suggestion": one concrete revision that would satisfy that point.',
    '- "top_actions": 3–7 imperative revision priorities, ordered by publication impact.',
    "",
    "# Grounding rules",
    "- Judge only the supplied manuscript. Do not invent missing experiments, results, citations, or factual errors.",
    "- Being the most hostile does not require inventing a major flaw. For a strong manuscript, make Reviewer 2 the toughest through sharper or more numerous proportionate minor/moderate comments.",
    "- Automatically extracted text may garble mathematics and symbols. Do not treat extraction artifacts as manuscript faults.",
    "- The three reviewers should have distinct emphases and should not repeat the same point in different words.",
    "",
    "# Output format",
    "Respond with a SINGLE fenced ```json code block and nothing else, matching exactly:",
    "```json",
    "{",
    '  "format": "peer_review",',
    '  "summary": "...",',
    '  "recommendation": "accept|minor_revision|major_revision|reject",',
    '  "criteria": [{ "id": "<rubric id>", "score": <integer 1-5>, "comments": "..." }],',
    '  "reviewer_summaries": { "reviewer_1": "...", "reviewer_2": "...", "reviewer_3": "..." },',
    '  "sections": [{ "reviewer": "reviewer_1|reviewer_2|reviewer_3", "anchor_quote": "...", "section_hint": "...", "severity": "minor|moderate|major", "comment": "...", "suggestion": "..." }],',
    '  "top_actions": ["...", "..."]',
    "}",
    "```",
  ].join("\n");

  return {
    systemPrompt,
    userMessage: documentMessage(
      docTitle,
      docText,
      "Return the three written reviewer reports now. Respond only with the single fenced JSON block.",
    ),
  };
}

export function buildDocReviewPrompt(args: {
  stage: StageTemplate;
  rubric: RubricCriterion[];
  docTitle: string;
  docText: string;
}): { systemPrompt: string; userMessage: string } {
  const { stage, rubric, docTitle, docText } = args;
  const { rubricLines, rubricIds } = reviewPromptContext(stage, rubric);

  const systemPrompt = [
    `You are a senior academic assessing a doctoral candidate's ${stage.title} document against the departmental rubric. You give the kind of review a rigorous, well-disposed assessor gives: direct about problems, specific about fixes, generous where the work earns it.`,
    "",
    "# Rubric",
    rubricLines,
    "",
    "Scoring guide (per criterion): 5 = clearly at doctoral standard; 4 = good, minor gaps; 3 = borderline, real concerns; 2 = well below standard; 1 = fundamentally lacking.",
    "",
    "# Task",
    "Produce a structured review with these parts:",
    '- "summary": one paragraph — the document\'s core claim, its overall standard, and the single biggest risk to passing this gate.',
    `- "criteria": score EVERY rubric criterion exactly once (ids: ${rubricIds}), each with a 1–5 score and an evidence-based comment.`,
    '- "sections": 6–12 findings, in document order, each anchored to a specific place in the text:',
    '  - "anchor_quote": a VERBATIM snippet of AT MOST 20 words copied CHARACTER-FOR-CHARACTER from the document — same spelling, same punctuation, same garbled artifacts if any. No paraphrase, no "..." elision, no added quotation marks. Pick a contiguous snippet distinctive enough to appear only once. Software matches this string exactly; an altered quote breaks the review.',
    '  - "section_hint": where the snippet sits (e.g. "Methods, laser writing subsection").',
    '  - "severity": "major" = threatens the case for passing the gate and must be fixed; "moderate" = noticeably weakens the document; "minor" = polish.',
    '  - "comment": what is wrong (or notably good) and why it matters, referencing the actual content.',
    '  - "suggestion": one concrete, actionable fix — what to write, add, cut, or measure. Never "consider improving clarity"-style advice.',
    '- "top_actions": 3–5 items, ordered by impact (highest first), each a single imperative sentence the candidate can act on this week.',
    "",
    "# Notes",
    "- The text was extracted automatically (often from PDF): mathematics, sub/superscripts, and symbols may be garbled. Do NOT report extraction artifacts as writing errors, and do not let them lower the writing score.",
    "- Judge the document that exists, not the project you imagine; every claim you make must be traceable to the text.",
    "",
    "# Output format",
    "Respond with a SINGLE fenced ```json code block and nothing else, matching exactly:",
    "```json",
    "{",
    '  "summary": "...",',
    '  "criteria": [{ "id": "<rubric id>", "score": <integer 1-5>, "comments": "..." }],',
    '  "sections": [{ "anchor_quote": "...", "section_hint": "...", "severity": "minor|moderate|major", "comment": "...", "suggestion": "..." }],',
    '  "top_actions": ["...", "..."]',
    "}",
    "```",
  ].join("\n");

  const userMessage = documentMessage(
    docTitle,
    docText,
    "Review it now. Respond with a single fenced ```json code block matching the schema. Output nothing outside the block.",
  );

  return { systemPrompt, userMessage };
}
