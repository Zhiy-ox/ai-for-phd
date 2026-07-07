// Prompt engineering + output schema for the one-shot rubric-based document
// review. The anchor_quote convention is load-bearing: the UI matches these
// snippets character-for-character against the extracted text.
import { z } from "zod";
import type { RubricCriterion, StageTemplate } from "@/lib/template";
import type { DocReviewResult } from "./types";

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

export function buildDocReviewPrompt(args: {
  stage: StageTemplate;
  rubric: RubricCriterion[];
  docTitle: string;
  docText: string;
}): { systemPrompt: string; userMessage: string } {
  const { stage, rubric, docTitle, docText } = args;
  const rubricLines = rubric
    .map((c) => `- "${c.id}" — ${c.title} (weight ${c.weight}): ${c.description}`)
    .join("\n");
  const rubricIds = rubric.map((c) => `"${c.id}"`).join(", ");

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

  const clipped =
    docText.length <= MAX_DOC_CHARS
      ? docText
      : `${docText.slice(0, MAX_DOC_CHARS)}\n[... document truncated for length ...]`;

  const userMessage = [
    "Here is the document to review:",
    "",
    `<document title="${docTitle.replace(/"/g, "'")}">`,
    clipped,
    "</document>",
    "",
    "Review it now. Respond with a single fenced ```json code block matching the schema. Output nothing outside the block.",
  ].join("\n");

  return { systemPrompt, userMessage };
}
