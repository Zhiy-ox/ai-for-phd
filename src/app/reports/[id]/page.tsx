"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { ProgrammeTemplate } from "@/lib/template";
import type { VivaAssessment } from "@/lib/viva/types";
import type { DocReviewResult, DocReviewSection } from "@/lib/review/types";
import { apiGet, formatDateTime, messageOf } from "@/components/api";
import { Markdown } from "@/components/markdown";
import { Card, Chip, ErrorBanner, PageLoading, SectionLabel } from "@/components/ui";

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

function DocReviewView({
  review,
  programme,
}: {
  review: DocReviewResult;
  programme: ProgrammeTemplate | null;
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
        <div className="mt-3 space-y-2.5">
          {review.criteria.map((c) => (
            <div key={c.id} className="grid gap-1 sm:grid-cols-[12rem_8rem_1fr] sm:gap-3">
              <span className="text-sm font-medium text-ink">{titles.get(c.id) ?? c.id}</span>
              <ScoreBar score={c.score} />
              <span className="text-sm leading-relaxed text-ink-soft">{c.comments}</span>
            </div>
          ))}
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

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportRow | null>(null);
  const [programme, setProgramme] = useState<ProgrammeTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ report: ReportRow }>(`/api/reports/${params.id}`)
      .then((r) => setReport(r.report))
      .catch((e) => setError(messageOf(e)));
    apiGet<{ programme: ProgrammeTemplate }>("/api/programme")
      .then((r) => setProgramme(r.programme))
      .catch(() => {});
  }, [params.id]);

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (!report) return <PageLoading label="Opening the report…" />;

  const isViva = report.type === "viva_assessment";
  const assessment = isViva ? parseRubric<VivaAssessment>(report) : null;
  const review = !isViva ? parseRubric<DocReviewResult>(report) : null;

  return (
    <div>
      <Link
        href={report.session_id ? `/sessions/${report.session_id}` : report.document_id ? `/documents/${report.document_id}` : "/"}
        className="text-sm text-ink-faint hover:text-oxford"
      >
        ← Back
      </Link>
      <header className="mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-oxford">
            {isViva ? "Viva assessment report" : "Document review"}
          </h1>
        </div>
        <p className="mt-1 text-xs text-ink-faint">{formatDateTime(report.created_at)}</p>
      </header>

      {isViva && assessment ? (
        <VivaAssessmentView report={report} assessment={assessment} programme={programme} />
      ) : !isViva && review ? (
        <DocReviewView review={review} programme={programme} />
      ) : (
        <Card className="p-6">
          <Markdown>{report.content_md}</Markdown>
        </Card>
      )}
    </div>
  );
}
