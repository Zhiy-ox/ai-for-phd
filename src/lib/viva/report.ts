// Post-viva assessment: one non-streaming completion by the panel secretary,
// validated against VivaAssessment and rendered into a GSO-style markdown
// report. On unrecoverable JSON failure the raw model text is stored instead.
import { getStage } from "@/lib/template";
import type { StageTemplate } from "@/lib/template";
import { getProvider } from "@/lib/providers/registry";
import { getSession, listMessages } from "@/lib/db/repos/sessions";
import { insertReport, type ReportRow } from "@/lib/db/repos/reports";
import { completeJsonWithRetry } from "@/lib/shared/json-extract";
import { buildAssessmentPrompt, VivaAssessmentSchema } from "./prompts";
import type { VivaAssessment, VivaConfig } from "./types";

export async function generateAssessment(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ReportRow> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const config = JSON.parse(session.config_json) as VivaConfig;
  const stage = getStage(config.programmeId, config.stageId);
  if (!stage.assessment) {
    throw new Error(`Stage "${stage.id}" has no assessment block; cannot assess this session.`);
  }
  const messages = listMessages(sessionId);
  if (messages.length === 0) {
    throw new Error("Cannot assess an empty viva — no exchanges were recorded.");
  }

  const provider = getProvider(config.provider);
  const { systemPrompt, userMessage } = buildAssessmentPrompt({ stage, messages });
  const result = await completeJsonWithRetry(
    provider,
    { systemPrompt, userMessage, model: config.model },
    VivaAssessmentSchema,
    signal,
  );

  if (!result.ok) {
    return insertReport({
      sessionId,
      type: "viva_assessment",
      verdict: null,
      contentMd: result.rawText,
    });
  }

  const assessment: VivaAssessment = {
    ...result.value,
    verdict: normalizeVerdict(result.value.verdict, stage),
  };
  return insertReport({
    sessionId,
    type: "viva_assessment",
    verdict: assessment.verdict,
    rubric: assessment,
    contentMd: renderAssessmentMarkdown(stage, assessment),
  });
}

// Maps whatever the model emitted onto a verdict id from the template when it
// clearly matches an id or label; otherwise keeps the raw string.
function normalizeVerdict(raw: string, stage: StageTemplate): string {
  const verdicts = stage.assessment?.verdicts ?? [];
  const needle = raw.trim().toLowerCase();
  const match = verdicts.find(
    (v) => v.id.toLowerCase() === needle || v.label.toLowerCase() === needle,
  );
  return match ? match.id : raw;
}

function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function renderAssessmentMarkdown(stage: StageTemplate, a: VivaAssessment): string {
  const assessment = stage.assessment;
  const rubric = assessment?.rubric ?? [];
  const panel = assessment?.panel ?? [];
  const verdictTemplate = assessment?.verdicts.find((v) => v.id === a.verdict);
  const formRef = stage.gate.formRef ? ` (${stage.gate.formRef})` : "";
  const date = new Date().toISOString().slice(0, 10);

  const verdictBanner = verdictTemplate
    ? `> **Verdict: ${verdictTemplate.label}** — ${verdictTemplate.description}`
    : `> **Verdict: ${a.verdict}**`;

  const scoreRows = a.criteria
    .map((c) => {
      const criterion = rubric.find((r) => r.id === c.id);
      const title = criterion ? criterion.title : c.id;
      return `| ${mdCell(title)} | ${c.score}/5 | ${mdCell(c.comments)} |`;
    })
    .join("\n");

  const lines = [
    `# ${stage.title} — Mock Viva Assessment${formRef}`,
    "",
    `**Date:** ${date}`,
    `**Panel:** ${panel.map((p) => `${p.name} (${p.role})`).join(", ")}`,
    "",
    verdictBanner,
    "",
    "## Rubric scores",
    "",
    "| Criterion | Score | Comments |",
    "| --- | --- | --- |",
    scoreRows,
    "",
    "## Strengths",
    "",
    ...a.strengths.map((s) => `- ${s}`),
    "",
    "## Weaknesses",
    "",
    ...a.weaknesses.map((w) => `- ${w}`),
    "",
    "## Panel narrative",
    "",
    a.narrative_md.trim(),
    "",
  ];
  return lines.join("\n");
}
