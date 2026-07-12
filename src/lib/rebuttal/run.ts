// Rebuttal-letter drafter: turns an ended sparring session (+ the uploaded
// referee reports) into a point-by-point response-to-reviewers letter the
// author can polish and submit. See docs/BUILD_PLAN.md §5 Phase C.
import { z } from "zod";
import { getStage } from "@/lib/template";
import { getProvider } from "@/lib/providers/registry";
import { getSession, listMessages } from "@/lib/db/repos/sessions";
import { getDocument } from "@/lib/db/repos/documents";
import { insertReport, type ReportRow } from "@/lib/db/repos/reports";
import { completeJsonWithRetry } from "@/lib/shared/json-extract";
import type { VivaConfig } from "@/lib/viva/types";

export interface RebuttalLetter {
  preamble: string;
  points: {
    // e.g. "Reviewer 2, point 3"
    source: string;
    // The referee's criticism, quoted or faithfully paraphrased.
    quote: string;
    // The author's response, drawing on how the point was defended in sparring.
    response: string;
    // The concrete manuscript change committed to ("None" when standing firm).
    action: string;
    // Where in the manuscript the change lands, when applicable.
    location: string;
  }[];
  closing: string;
}

export const RebuttalLetterSchema: z.ZodType<RebuttalLetter> = z.object({
  preamble: z.string(),
  points: z
    .array(
      z.object({
        source: z.string(),
        quote: z.string(),
        response: z.string(),
        action: z.string(),
        location: z.string(),
      }),
    )
    .min(1),
  closing: z.string(),
});

const MAX_BLOCK_CHARS = 100_000;
function clip(text: string): string {
  return text.length <= MAX_BLOCK_CHARS
    ? text
    : `${text.slice(0, MAX_BLOCK_CHARS)}\n[... truncated ...]`;
}

export function renderRebuttalMarkdown(letter: RebuttalLetter): string {
  const lines = [
    "# Response to Reviewers",
    "",
    letter.preamble.trim(),
    "",
    ...letter.points.flatMap((p, i) => [
      `## ${i + 1}. ${p.source}`,
      "",
      `> ${p.quote.trim().replace(/\n/g, "\n> ")}`,
      "",
      `**Response.** ${p.response.trim()}`,
      "",
      `**Change made.** ${p.action.trim()}${
        p.location.trim() && p.action.trim().toLowerCase() !== "none"
          ? ` *(${p.location.trim()})*`
          : ""
      }`,
      "",
    ]),
    letter.closing.trim(),
    "",
  ];
  return lines.join("\n");
}

export async function draftRebuttalLetter(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ReportRow> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const config = JSON.parse(session.config_json) as VivaConfig;
  const stage = getStage(config.programmeId, config.stageId);
  if (!stage.activities.includes("rebuttal_roleplay")) {
    throw new Error("Rebuttal letters are drafted from Papers & Rebuttals sessions.");
  }
  const messages = listMessages(sessionId);
  if (messages.length === 0) {
    throw new Error("This session has no exchanges to draft from.");
  }

  const docs = config.documentIds
    .map((id) => getDocument(id))
    .filter((d) => d !== null && d.extracted_text);
  const manuscript = docs[0];
  const refereeReports = docs.filter((d) => d!.kind === "referee_reports");

  const transcript = messages
    .map((m) =>
      m.role === "user" ? `AUTHOR: ${m.content}` : `PANEL${m.speaker ? ` [${m.speaker}]` : ""}: ${m.content}`,
    )
    .join("\n\n");

  const systemPrompt = [
    "You are an experienced academic co-author drafting a response-to-reviewers letter. You write in the first person plural (\"we\"), courteous and confident: thank reviewers briefly, answer every substantive point head-on with evidence, concede gracefully where the criticism lands, and state precisely what was changed in the manuscript. Never grovel, never evade.",
    "",
    "# Inputs",
    "- The manuscript under review (for titles, sections, and claims).",
    refereeReports.length > 0
      ? "- The actual referee reports: cover EVERY substantive point from them, in order, grouped by reviewer."
      : "- No referee reports were uploaded: reconstruct the substantive objections from the sparring transcript instead.",
    "- A sparring-rehearsal transcript in which the author practised defending the paper. Mine it for the author's strongest arguments and any concessions — but write the letter's responses yourself at publication quality; do not quote the transcript.",
    "",
    "# Rules",
    "- One entry per substantive referee point. \"source\" like \"Reviewer 2, point 3\" (or \"Panel objection 2\" when reconstructing).",
    "- \"quote\": the referee's point, quoted or faithfully condensed.",
    "- \"response\": the scientific answer, with numbers/citations where the transcript or manuscript provides them.",
    "- \"action\": the concrete manuscript change, or \"None\" with the response carrying the justification for standing firm.",
    "- \"location\": section/figure reference for the change, empty string when action is None.",
    "- preamble: 2–3 sentences thanking the reviewers and summarising the main revisions. closing: 1–2 sentences.",
    "",
    "# Output format",
    "Respond with a SINGLE fenced ```json code block and nothing else, matching exactly:",
    "```json",
    '{ "preamble": "...", "points": [{ "source": "...", "quote": "...", "response": "...", "action": "...", "location": "..." }], "closing": "..." }',
    "```",
  ].join("\n");

  const userMessage = [
    manuscript ? `<manuscript title="${manuscript!.filename}">\n${clip(manuscript!.extracted_text!)}\n</manuscript>` : "",
    ...refereeReports.map(
      (d) => `<referee_reports title="${d!.filename}">\n${clip(d!.extracted_text!)}\n</referee_reports>`,
    ),
    `<sparring_transcript>\n${clip(transcript)}\n</sparring_transcript>`,
    "",
    "Draft the response-to-reviewers letter now as a single fenced ```json code block. Output nothing outside the block.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const provider = getProvider(config.provider);
  const result = await completeJsonWithRetry(
    provider,
    { systemPrompt, userMessage, model: config.model },
    RebuttalLetterSchema,
    signal,
  );

  if (!result.ok) {
    return insertReport({ sessionId, type: "rebuttal_letter", contentMd: result.rawText });
  }
  return insertReport({
    sessionId,
    type: "rebuttal_letter",
    rubric: result.value,
    contentMd: renderRebuttalMarkdown(result.value),
  });
}
