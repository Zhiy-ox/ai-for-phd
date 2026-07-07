// Pre-viva question planning: one non-streaming completion that reads the
// candidate's report and maps 5–6 question areas onto the stage rubric.
// The plan is a quality booster, not a dependency — on failure the viva
// simply runs without one.
import { z } from "zod";
import type { LLMProvider } from "@/lib/providers/types";
import type { StageTemplate } from "@/lib/template";
import type { QuestionPlan } from "./types";
import { completeJsonWithRetry } from "@/lib/shared/json-extract";

const MAX_PLAN_DOC_CHARS = 120_000;

export const QuestionPlanSchema: z.ZodType<QuestionPlan> = z.object({
  areas: z
    .array(
      z.object({
        rubricId: z.string(),
        title: z.string(),
        seedQuestions: z.array(z.string()).min(1),
        weakSpots: z.array(z.string()),
      }),
    )
    .min(1),
});

export async function generateQuestionPlan(
  provider: LLMProvider,
  model: string | undefined,
  stage: StageTemplate,
  docText: string,
  signal?: AbortSignal,
): Promise<QuestionPlan | undefined> {
  const rubric = stage.assessment?.rubric ?? [];
  if (rubric.length === 0) return undefined;
  const rubricLines = rubric
    .map((c) => `- "${c.id}" — ${c.title}: ${c.description}`)
    .join("\n");

  const systemPrompt = [
    `You are the convenor of a University of Oxford ${stage.title} viva panel, preparing the panel's question plan after reading the candidate's report.`,
    "",
    "# Rubric criteria (use these ids)",
    rubricLines,
    "",
    "# Task",
    "Read the report and produce a question plan:",
    "- 5–6 areas, each mapped to ONE rubric id from the list above; between them the areas should cover every criterion that this report gives you material for.",
    '- Each area: a short "title", 2–3 "seedQuestions" phrased exactly as an assessor would ask them aloud, and "weakSpots" — concrete soft points you actually found in THIS report (unsupported claims, missing controls, thin literature coverage, vague plans, suspicious numbers). Quote short phrases from the report in the weak spots where you can. If an area has no genuine weak spot, use an empty array rather than inventing one.',
    "- Questions must be specific to this report — reference its actual claims, methods, numbers, and figures. Generic viva questions are useless.",
    "- The report text was extracted automatically and may garble mathematics; do not list notation artifacts as weak spots.",
    "",
    "# Output format",
    "Respond with a SINGLE fenced ```json code block and nothing else, matching exactly:",
    "```json",
    "{",
    '  "areas": [',
    "    {",
    '      "rubricId": "<rubric id>",',
    '      "title": "<short area title>",',
    '      "seedQuestions": ["<question>", "<question>"],',
    '      "weakSpots": ["<concrete soft point in this report>"]',
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");

  const clipped =
    docText.length <= MAX_PLAN_DOC_CHARS
      ? docText
      : `${docText.slice(0, MAX_PLAN_DOC_CHARS)}\n[... document truncated for length ...]`;

  const userMessage = [
    "Here is the candidate's report:",
    "",
    "<document>",
    clipped,
    "</document>",
    "",
    "Produce the question plan now as a single fenced ```json code block. Output nothing outside the block.",
  ].join("\n");

  const result = await completeJsonWithRetry(
    provider,
    { systemPrompt, userMessage, model },
    QuestionPlanSchema,
    signal,
  );
  return result.ok ? result.value : undefined;
}
