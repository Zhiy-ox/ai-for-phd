// One-shot rubric-based document review: load text, pick the stage rubric,
// run a single completion, validate, render markdown, persist the report.
import {
  DEFAULT_PROGRAMME_ID,
  getProgramme,
  getStage,
  hasWrittenPeerReview,
} from "@/lib/template";
import { getActiveProgrammeId } from "@/lib/programme";
import type { RubricCriterion, StageTemplate } from "@/lib/template";
import { resolveProviderAndModel } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import { getDocument } from "@/lib/db/repos/documents";
import { insertReport, type ReportRow } from "@/lib/db/repos/reports";
import { insertFinding } from "@/lib/db/repos/findings";
import { completeJsonWithUsageTracking } from "@/lib/providers/usage-completion";
import {
  buildDocReviewPrompt,
  buildPeerReviewPrompt,
  DocReviewResultSchema,
  peerReviewResultSchemaForRubric,
} from "./prompts";
import type {
  DocReviewResult,
  DocReviewSection,
  PeerReviewerId,
  PeerReviewResult,
} from "./types";

export async function runDocReview(
  documentId: string,
  opts: { provider?: ProviderId; stageId?: string; model?: string },
  signal?: AbortSignal,
): Promise<ReportRow> {
  const doc = getDocument(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  const programmeId = getActiveProgrammeId();
  if (doc.programme_id !== programmeId) {
    throw new Error(
      `Document "${doc.filename}" belongs to programme "${doc.programme_id}", not the active programme "${programmeId}". Switch programmes or upload it again before requesting a review.`,
    );
  }
  if (!doc.extracted_text) {
    throw new Error(
      `Document "${doc.filename}" has no extracted text — re-upload a supported file or paste its text first.`,
    );
  }

  const requestedStageId = opts.stageId ?? doc.stage_id ?? null;
  let stage: StageTemplate | undefined;
  if (requestedStageId) {
    try {
      stage = getStage(programmeId, requestedStageId);
    } catch {
      // Stage from another programme (e.g. after switching presets) — fall through.
    }
  }
  // Fall back to the active programme's first stage that carries a rubric.
  stage ??= getProgramme(programmeId).stages.find((s) => s.assessment || s.reviewRubric);
  if (!stage) throw new Error("No rubric-bearing stage in the active programme.");
  const rubric =
    stage.assessment?.rubric ??
    stage.reviewRubric ??
    getStage(DEFAULT_PROGRAMME_ID, "transfer").assessment?.rubric;
  if (!rubric || rubric.length === 0) {
    throw new Error(`No rubric available for stage "${stage.id}".`);
  }

  if (hasWrittenPeerReview(stage)) {
    if (doc.kind !== "paper") {
      throw new Error("Written reviewer comments can only be generated from a paper or manuscript.");
    }
    const { provider, model } = resolveProviderAndModel(opts);
    const { systemPrompt, userMessage } = buildPeerReviewPrompt({
      stage,
      rubric,
      docTitle: doc.filename,
      docText: doc.extracted_text,
    });
    const result = await completeJsonWithUsageTracking(
      provider,
      { systemPrompt, userMessage, model },
      peerReviewResultSchemaForRubric(rubric),
      signal,
    );
    if (!result.ok) {
      return insertReport({
        documentId,
        type: "doc_review",
        contentMd: result.rawText,
      });
    }
    const report = insertReport({
      documentId,
      type: "doc_review",
      verdict: result.value.recommendation,
      rubric: result.value,
      contentMd: renderPeerReviewMarkdown(stage, rubric, doc.filename, result.value),
    });
    for (const section of result.value.sections) {
      if (section.severity === "minor") continue;
      insertFinding({
        programmeId,
        stageId: stage.id,
        description: `${reviewerLabel(section.reviewer)}: ${section.comment}`,
        evidence: section.anchor_quote,
        sourceType: "doc_review",
        sourceId: report.id,
      });
    }
    return report;
  }

  const { provider, model } = resolveProviderAndModel(opts);
  const { systemPrompt, userMessage } = buildDocReviewPrompt({
    stage,
    rubric,
    docTitle: doc.filename,
    docText: doc.extracted_text,
  });
  const result = await completeJsonWithUsageTracking(
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

  const report = insertReport({
    documentId,
    type: "doc_review",
    rubric: result.value,
    contentMd: renderReviewMarkdown(stage, rubric, doc.filename, result.value),
  });
  for (const section of result.value.sections) {
    if (section.severity === "minor") continue;
    insertFinding({
      programmeId,
      stageId: stage.id,
      description: section.comment,
      evidence: section.anchor_quote,
      sourceType: "doc_review",
      sourceId: report.id,
    });
  }
  return report;
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

const PEER_REVIEWERS: PeerReviewerId[] = ["reviewer_1", "reviewer_2", "reviewer_3"];

function reviewerLabel(reviewer: PeerReviewerId): string {
  return `Reviewer ${reviewer.slice(-1)}`;
}

export function renderPeerReviewMarkdown(
  stage: StageTemplate,
  rubric: RubricCriterion[],
  filename: string,
  review: PeerReviewResult,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const scoreRows = review.criteria
    .map((criterion) => {
      const rubricCriterion = rubric.find((item) => item.id === criterion.id);
      return `| ${mdCell(rubricCriterion?.title ?? criterion.id)} | ${criterion.score}/5 | ${mdCell(criterion.comments)} |`;
    })
    .join("\n");
  const reviewerReports = PEER_REVIEWERS.flatMap((reviewer) => {
    const sections = review.sections.filter((section) => section.reviewer === reviewer);
    return [
      `## ${reviewerLabel(reviewer)}${reviewer === "reviewer_2" ? " — most hostile" : ""}`,
      "",
      review.reviewer_summaries[reviewer].trim(),
      "",
      ...sections.flatMap((section, index) => [
        `${index + 1}. **${SEVERITY_HEADINGS[section.severity]} — ${section.section_hint}**`,
        `   > “${section.anchor_quote}”`,
        `   ${section.comment}`,
        `   **Suggested revision:** ${section.suggestion}`,
        "",
      ]),
    ];
  });
  return [
    `# Peer review comments — ${filename}`,
    "",
    `**Stage:** ${stage.title}`,
    `**Date:** ${date}`,
    `**Editorial recommendation:** ${review.recommendation.replace(/_/g, " ")}`,
    "",
    "## Editorial summary",
    "",
    review.summary.trim(),
    "",
    ...reviewerReports,
    "## Editorial scorecard",
    "",
    "| Criterion | Score | Comments |",
    "| --- | --- | --- |",
    scoreRows,
    "",
    "## Revision priorities",
    "",
    ...review.top_actions.map((action, index) => `${index + 1}. ${action}`),
    "",
  ].join("\n");
}

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
