// One-shot rubric-based document review: load text, pick the stage rubric,
// run a single completion, validate, render markdown, persist the report.
import { DEFAULT_PROGRAMME_ID, getStage } from "@/lib/template";
import type { RubricCriterion, StageTemplate } from "@/lib/template";
import { resolveProviderAndModel } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import { getDocument } from "@/lib/db/repos/documents";
import { insertReport, type ReportRow } from "@/lib/db/repos/reports";
import { completeJsonWithRetry } from "@/lib/shared/json-extract";
import { buildDocReviewPrompt, DocReviewResultSchema } from "./prompts";
import type { DocReviewResult, DocReviewSection } from "./types";

export async function runDocReview(
  documentId: string,
  opts: { provider?: ProviderId; stageId?: string; model?: string },
  signal?: AbortSignal,
): Promise<ReportRow> {
  const doc = getDocument(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  if (!doc.extracted_text) {
    throw new Error(
      `Document "${doc.filename}" has no extracted text — re-upload a supported file or paste its text first.`,
    );
  }

  const stageId = opts.stageId ?? doc.stage_id ?? "transfer";
  const stage = getStage(DEFAULT_PROGRAMME_ID, stageId);
  const rubric =
    stage.assessment?.rubric ??
    stage.reviewRubric ??
    getStage(DEFAULT_PROGRAMME_ID, "transfer").assessment?.rubric;
  if (!rubric || rubric.length === 0) {
    throw new Error(`No rubric available for stage "${stageId}".`);
  }

  const { provider, model } = resolveProviderAndModel(opts);
  const { systemPrompt, userMessage } = buildDocReviewPrompt({
    stage,
    rubric,
    docTitle: doc.filename,
    docText: doc.extracted_text,
  });
  const result = await completeJsonWithRetry(
    provider,
    { systemPrompt, userMessage, model },
    DocReviewResultSchema,
    signal,
  );

  if (!result.ok) {
    return insertReport({
      documentId,
      type: "doc_review",
      contentMd: result.rawText,
    });
  }

  return insertReport({
    documentId,
    type: "doc_review",
    rubric: result.value,
    contentMd: renderReviewMarkdown(stage, rubric, doc.filename, result.value),
  });
}

function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

const SEVERITY_ORDER: DocReviewSection["severity"][] = ["major", "moderate", "minor"];
const SEVERITY_HEADINGS: Record<DocReviewSection["severity"], string> = {
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
};

function renderReviewMarkdown(
  stage: StageTemplate,
  rubric: RubricCriterion[],
  filename: string,
  review: DocReviewResult,
): string {
  const date = new Date().toISOString().slice(0, 10);

  const scoreRows = review.criteria
    .map((c) => {
      const criterion = rubric.find((r) => r.id === c.id);
      const title = criterion ? criterion.title : c.id;
      return `| ${mdCell(title)} | ${c.score}/5 | ${mdCell(c.comments)} |`;
    })
    .join("\n");

  const findingGroups = SEVERITY_ORDER.flatMap((severity) => {
    const sections = review.sections.filter((s) => s.severity === severity);
    if (sections.length === 0) return [];
    return [
      `### ${SEVERITY_HEADINGS[severity]}`,
      "",
      ...sections.flatMap((s) => [
        `- **"${s.anchor_quote}"** (${s.section_hint})`,
        `  ${s.comment}`,
        `  *Suggestion:* ${s.suggestion}`,
      ]),
      "",
    ];
  });

  const lines = [
    `# Document review — ${filename}`,
    "",
    `**Stage:** ${stage.title}`,
    `**Date:** ${date}`,
    "",
    "## Summary",
    "",
    review.summary.trim(),
    "",
    "## Scorecard",
    "",
    "| Criterion | Score | Comments |",
    "| --- | --- | --- |",
    scoreRows,
    "",
    "## Findings",
    "",
    ...findingGroups,
    "## Top actions",
    "",
    ...review.top_actions.map((a, i) => `${i + 1}. ${a}`),
    "",
  ];
  return lines.join("\n");
}
