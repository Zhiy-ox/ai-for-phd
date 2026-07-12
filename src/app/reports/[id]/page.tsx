"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DocumentRow, DocumentSummary } from "@/lib/db/repos/documents";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { ProgrammeTemplate } from "@/lib/template";
import type { VivaAssessment } from "@/lib/viva/types";
import type { DocReviewResult, DocReviewSection } from "@/lib/review/types";
import { findPreviousDocReview, parseDocReviewResult } from "@/lib/review/score-deltas";
import { apiGet, apiSend, formatDate, formatDateTime, messageOf } from "@/components/api";
import { Markdown } from "@/components/markdown";
import { Button, Card, Chip, ErrorBanner, PageLoading, SectionLabel, Spinner } from "@/components/ui";

function parseRubric<T>(report: ReportRow): T | null {
  if (!report.rubric_json) return null;
  try {
    return JSON.parse(report.rubric_json) as T;
  } catch {
    return null;
  }
}

function useCriterionTitles(programme: ProgrammeTemplate | null): Map<string, string> {
  return useMemo(() => {
    const map = new Map<string, string>();
    programme?.stages.forEach((s) =>
      s.assessment?.rubric.forEach((c) => map.set(c.id, c.title)),
    );
    return map;
  }, [programme]);
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(5, score));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full ${
            clamped >= 4 ? "bg-emerald-500" : clamped >= 3 ? "bg-brass" : "bg-red-400"
          }`}
          style={{ width: `${(clamped / 5) * 100}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-ink-soft">{clamped}/5</span>
    </div>
  );
}

function ScoreDelta({ delta }: { delta: number }) {
  if (!Number.isFinite(delta)) return null;
  const increased = delta > 0;
  const amount = Math.round(Math.abs(delta) * 100) / 100;
  if (amount === 0) return null;
  const label = `Score ${increased ? "increased" : "decreased"} by ${amount} ${
    amount === 1 ? "point" : "points"
  }`;
  return (
    <span
      title={label}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        increased
          ? "border-verdant bg-verdant text-oxford-deep"
          : "border-red-600 bg-red-600 text-white"
      }`}
    >
      <span aria-hidden="true">{increased ? `▲+${amount}` : `▼−${amount}`}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function VerdictBanner({
  verdict,
  programme,
}: {
  verdict: string;
  programme: ProgrammeTemplate | null;
}) {
  const template = programme?.stages
    .flatMap((s) => s.assessment?.verdicts ?? [])
    .find((v) => v.id === verdict);
  const tone =
    verdict === "approved"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : verdict === "referred"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-red-300 bg-red-50 text-red-900";
  return (
    <div className={`rounded-xl border px-5 py-4 ${tone}`}>
      <p className="font-display text-lg">{template?.label ?? verdict}</p>
      {template?.description ? (
        <p className="mt-1 text-sm opacity-80">{template.description}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Viva assessment                                                     */
/* ------------------------------------------------------------------ */

function VivaAssessmentView({
  report,
  assessment,
  programme,
}: {
  report: ReportRow;
  assessment: VivaAssessment;
  programme: ProgrammeTemplate | null;
}) {
  const titles = useCriterionTitles(programme);
  return (
    <div className="space-y-6">
      <VerdictBanner verdict={assessment.verdict} programme={programme} />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-oxford-faint text-left">
              <th className="px-4 py-2.5 font-display font-medium text-oxford">Criterion</th>
              <th className="px-4 py-2.5 font-display font-medium text-oxford">Score</th>
              <th className="px-4 py-2.5 font-display font-medium text-oxford">Comments</th>
            </tr>
          </thead>
          <tbody>
            {assessment.criteria.map((c) => (
              <tr key={c.id} className="border-b border-line/60 align-top last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{titles.get(c.id) ?? c.id}</td>
                <td className="px-4 py-3">
                  <ScoreBar score={c.score} />
                </td>
                <td className="px-4 py-3 leading-relaxed text-ink-soft">{c.comments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <SectionLabel>Strengths</SectionLabel>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            {assessment.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <SectionLabel>Weaknesses</SectionLabel>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            {assessment.weaknesses.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-6">
        <Markdown>{report.content_md}</Markdown>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Document review                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: DocReviewSection["severity"][] = ["major", "moderate", "minor"];
const SEVERITY_STYLE: Record<DocReviewSection["severity"], string> = {
  major: "border-red-200 bg-red-50/60",
  moderate: "border-amber-200 bg-amber-50/60",
  minor: "border-line bg-white",
};

interface ReviewComparison {
  reportId: string;
  previousCreatedAt: string;
  previousScores: Map<string, number>;
}

async function loadReviewComparison(report: ReportRow): Promise<ReviewComparison | null> {
  if (report.type !== "doc_review" || !report.document_id) return null;
  const documentId = report.document_id;
  if (!parseDocReviewResult(report)) return null;

  const documentAndStageDocuments = (async () => {
    const { document } = await apiGet<{ document: DocumentRow }>(
      `/api/documents/${encodeURIComponent(documentId)}`,
    );
    const { documents } = await apiGet<{ documents: DocumentSummary[] }>(
      `/api/documents?stageId=${encodeURIComponent(document.stage_id ?? "")}`,
    );
    return { document, documents };
  })();
  const [{ document, documents }, { reports }] = await Promise.all([
    documentAndStageDocuments,
    apiGet<{ reports: ReportRow[] }>("/api/reports?type=doc_review"),
  ]);
  const previousReport = findPreviousDocReview({
    currentReport: report,
    currentDocument: document,
    stageDocuments: documents,
    reports,
  });
  if (!previousReport) return null;

  const previousReview = parseDocReviewResult(previousReport);
  if (!previousReview) return null;
  const previousScores = new Map<string, number>();
  for (const criterion of previousReview.criteria) {
    if (
      criterion &&
      typeof criterion.id === "string" &&
      typeof criterion.score === "number" &&
      Number.isFinite(criterion.score)
    ) {
      previousScores.set(criterion.id, criterion.score);
    }
  }
  if (previousScores.size === 0) return null;
  return {
    reportId: report.id,
    previousCreatedAt: previousReport.created_at,
    previousScores,
  };
}

function DocReviewView({
  review,
  programme,
  comparison,
}: {
  review: DocReviewResult;
  programme: ProgrammeTemplate | null;
  comparison: ReviewComparison | null;
}) {
  const titles = useCriterionTitles(programme);
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <SectionLabel>Summary</SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{review.summary}</p>
      </Card>

      <Card className="p-5">
        <SectionLabel>Scorecard</SectionLabel>
        {comparison ? (
          <p className="mt-1 text-xs text-ink-soft">
            vs review of{" "}
            <time dateTime={comparison.previousCreatedAt}>
              {formatDate(comparison.previousCreatedAt)}
            </time>
          </p>
        ) : null}
        <div className="mt-3 space-y-2.5">
          {review.criteria.map((c) => {
            const previousScore = comparison?.previousScores.get(c.id);
            const delta = previousScore === undefined ? null : c.score - previousScore;
            return (
              <div
                key={c.id}
                className="grid gap-1 sm:grid-cols-[12rem_11rem_minmax(0,1fr)] sm:gap-3"
              >
                <span className="text-sm font-medium text-ink">{titles.get(c.id) ?? c.id}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <ScoreBar score={c.score} />
                  {delta === null ? null : <ScoreDelta delta={delta} />}
                </div>
                <span className="text-sm leading-relaxed text-ink-soft">{c.comments}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <SectionLabel>Findings</SectionLabel>
        <div className="mt-2 space-y-3">
          {SEVERITY_ORDER.flatMap((sev) =>
            review.sections
              .filter((s) => s.severity === sev)
              .map((s, i) => (
                <div
                  key={`${sev}-${i}`}
                  className={`rounded-xl border p-4 ${SEVERITY_STYLE[sev]}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      tone={sev === "major" ? "red" : sev === "moderate" ? "amber" : "neutral"}
                    >
                      {sev}
                    </Chip>
                    <span className="text-xs text-ink-faint">{s.section_hint}</span>
                  </div>
                  <blockquote className="mt-2 border-l-2 border-oxford/40 pl-3 font-display text-sm italic text-ink-soft">
                    “{s.anchor_quote}”
                  </blockquote>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{s.comment}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-oxford">
                    <span className="font-medium">Suggestion:</span> {s.suggestion}
                  </p>
                </div>
              )),
          )}
        </div>
      </div>

      <Card className="p-5">
        <SectionLabel>Top actions</SectionLabel>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {review.top_actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Rebuttal letter — editable before sending                           */
/* ------------------------------------------------------------------ */

function RebuttalLetterView({ report }: { report: ReportRow }) {
  const [content, setContent] = useState(report.content_md);
  const [savedContent, setSavedContent] = useState(report.content_md);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = content !== savedContent && content.trim().length > 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/reports/${report.id}`, "PATCH", { contentMd: content });
      setSavedContent(content);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "response-to-reviewers.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Spinner /> : null} Save edits
        </Button>
        <Button variant="secondary" onClick={download}>
          Download .md
        </Button>
        {savedAt ? <span className="text-xs text-ink-faint">Saved {savedAt}</span> : null}
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={24}
        className="w-full rounded-2xl border border-line bg-card p-5 font-mono text-[13px] leading-relaxed text-ink focus:border-oxford focus:outline-none"
      />
      <Card className="p-6">
        <SectionLabel>Preview</SectionLabel>
        <div className="mt-3">
          <Markdown>{content}</Markdown>
        </div>
      </Card>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportRow | null>(null);
  const [programme, setProgramme] = useState<ProgrammeTemplate | null>(null);
  const [reviewComparison, setReviewComparison] = useState<ReviewComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ report: ReportRow }>(`/api/reports/${params.id}`)
      .then((r) => setReport(r.report))
      .catch((e) => setError(messageOf(e)));
    apiGet<{ programme: ProgrammeTemplate }>("/api/programme")
      .then((r) => setProgramme(r.programme))
      .catch(() => {});
  }, [params.id]);

  useEffect(() => {
    if (!report || report.type !== "doc_review" || !report.document_id) return;
    let cancelled = false;
    void loadReviewComparison(report)
      .then((comparison) => {
        if (!cancelled) setReviewComparison(comparison);
      })
      .catch(() => {
        if (!cancelled) setReviewComparison(null);
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (!report) return <PageLoading label="Opening the report…" />;

  const isViva = report.type === "viva_assessment";
  const assessment = isViva ? parseRubric<VivaAssessment>(report) : null;
  const review = !isViva && report.type === "doc_review" ? parseDocReviewResult(report) : null;
  const comparison = reviewComparison?.reportId === report.id ? reviewComparison : null;

  return (
    <div className="mx-auto max-w-[880px] px-5 py-11 md:px-9">
      <Link
        href={report.session_id ? `/sessions/${report.session_id}` : report.document_id ? `/documents/${report.document_id}` : "/"}
        className="text-sm text-ink-faint hover:text-oxford"
      >
        ← Back
      </Link>
      <header className="mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[32px] font-normal text-ink">
            {isViva
              ? "Viva assessment report"
              : report.type === "rebuttal_letter"
                ? "Response to reviewers"
                : "Document review"}
          </h1>
        </div>
        <p className="mt-1 text-xs text-ink-faint">{formatDateTime(report.created_at)}</p>
      </header>

      {report.type === "rebuttal_letter" ? (
        <RebuttalLetterView report={report} />
      ) : isViva && assessment ? (
        <VivaAssessmentView report={report} assessment={assessment} programme={programme} />
      ) : !isViva && review ? (
        <DocReviewView review={review} programme={programme} comparison={comparison} />
      ) : (
        <Card className="p-6">
          <Markdown>{report.content_md}</Markdown>
        </Card>
      )}
    </div>
  );
}
