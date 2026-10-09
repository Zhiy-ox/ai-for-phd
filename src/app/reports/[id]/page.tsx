"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DocumentRow, DocumentSummary } from "@/lib/db/repos/documents";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { ProgrammeTemplate } from "@/lib/template";
import type { VivaAssessment } from "@/lib/viva/types";
import {
  IMPORTED_EFFORT_LABELS,
  IMPORTED_STANCE_LABELS,
  isPeerReviewResult,
  parseImportedReview,
  type DocReviewResult,
  type DocReviewSection,
  type ImportedCommentCategory,
  type ImportedCommentStance,
  type ImportedReviewResult,
  type PeerReviewerId,
  type PeerReviewResult,
} from "@/lib/review/types";
import { findPreviousDocReview, parseDocReviewResult } from "@/lib/review/score-deltas";
import { responseLetterMeta } from "@/lib/rebuttal/meta";
import { apiGet, apiSend, formatDate, formatDateTime, messageOf } from "@/components/api";
import { Markdown } from "@/components/markdown";
import { Burst, Button, Card, Chip, ErrorBanner, PageLoading, SectionLabel, Spinner, type ChipTone } from "@/components/ui";
import type { CSSProperties } from "react";

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
    programme?.stages.forEach((s) => {
      s.reviewRubric?.forEach((c) => map.set(c.id, c.title));
      s.assessment?.rubric.forEach((c) => map.set(c.id, c.title));
    });
    return map;
  }, [programme]);
}

function ScoreBar({ score, delay = 0 }: { score: number; delay?: number }) {
  const clamped = Math.max(0, Math.min(5, score));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full origin-left rounded-full ${
            clamped >= 4 ? "bg-emerald-500" : clamped >= 3 ? "bg-brass" : "bg-red-400"
          }`}
          style={{
            width: `${(clamped / 5) * 100}%`,
            animation: `growBar 0.7s ${delay}ms cubic-bezier(0.16,1,0.3,1) both`,
          }}
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

// The good outcomes across all three programme templates.
const PASS_VERDICTS = new Set(["approved", "pass", "minor_corrections", "accept"]);
const FAIL_VERDICTS = new Set(["reject", "not_passed", "fail"]);

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
  const passed = PASS_VERDICTS.has(verdict);
  const tone = passed
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : FAIL_VERDICTS.has(verdict)
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <div className={`anim-pop relative rounded-xl border px-5 py-4 ${tone}`}>
      {passed ? <Burst /> : null}
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

      <Card className="anim-rise overflow-hidden" style={{ "--d": "80ms" } as CSSProperties}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-oxford-faint text-left">
              <th className="px-4 py-2.5 font-display font-medium text-oxford">Criterion</th>
              <th className="px-4 py-2.5 font-display font-medium text-oxford">Score</th>
              <th className="px-4 py-2.5 font-display font-medium text-oxford">Comments</th>
            </tr>
          </thead>
          <tbody>
            {assessment.criteria.map((c, i) => (
              <tr key={c.id} className="border-b border-line/60 align-top last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{titles.get(c.id) ?? c.id}</td>
                <td className="px-4 py-3">
                  <ScoreBar score={c.score} delay={200 + i * 110} />
                </td>
                <td className="px-4 py-3 leading-relaxed text-ink-soft">{c.comments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="anim-rise grid gap-4 md:grid-cols-2" style={{ "--d": "180ms" } as CSSProperties}>
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

      <Card className="anim-rise p-6" style={{ "--d": "280ms" } as CSSProperties}>
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
      <Card className="anim-rise p-5">
        <SectionLabel>Summary</SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{review.summary}</p>
      </Card>

      <Card className="anim-rise p-5" style={{ "--d": "100ms" } as CSSProperties}>
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
          {review.criteria.map((c, i) => {
            const previousScore = comparison?.previousScores.get(c.id);
            const delta = previousScore === undefined ? null : c.score - previousScore;
            return (
              <div
                key={c.id}
                className="grid gap-1 sm:grid-cols-[12rem_11rem_minmax(0,1fr)] sm:gap-3"
              >
                <span className="text-sm font-medium text-ink">{titles.get(c.id) ?? c.id}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <ScoreBar score={c.score} delay={200 + i * 110} />
                  {delta === null ? null : <ScoreDelta delta={delta} />}
                </div>
                <span className="text-sm leading-relaxed text-ink-soft">{c.comments}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="anim-rise" style={{ "--d": "200ms" } as CSSProperties}>
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

      <Card className="anim-rise p-5" style={{ "--d": "300ms" } as CSSProperties}>
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

const PEER_REVIEWER_META: Record<
  PeerReviewerId,
  { label: string; remit: string; accent: string }
> = {
  reviewer_1: {
    label: "Reviewer 1",
    remit: "Methods, reproducibility, and presentation",
    accent: "border-oxford/30 bg-card",
  },
  reviewer_2: {
    label: "Reviewer 2",
    remit: "Most hostile · novelty and technical soundness, never abusive",
    accent: "border-brass/60 bg-gold-bg",
  },
  reviewer_3: {
    label: "Reviewer 3",
    remit: "Significance, literature, framing, and clarity",
    accent: "border-line bg-card",
  },
};

const PEER_REVIEWER_ORDER: PeerReviewerId[] = ["reviewer_1", "reviewer_2", "reviewer_3"];

// The response letter answering a reviewer-comments report: finds an
// existing finished letter, or creates one on demand.
function useResponseLetter(report: ReportRow) {
  const [drafting, setDrafting] = useState(false);
  const [existingId, setExistingId] = useState<string | null | undefined>(() =>
    report.document_id ? undefined : null,
  );
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!report.document_id) return;
    let cancelled = false;
    void apiGet<{ reports: ReportRow[] }>(
      `/api/reports?documentId=${encodeURIComponent(report.document_id)}&type=rebuttal_letter`,
    )
      .then(({ reports }) => {
        if (cancelled) return;
        // Failed drafts stay readable from their own page but don't count
        // here, so the button offers a fresh attempt instead.
        const response = reports.find((candidate) => {
          const meta = responseLetterMeta(candidate.rubric_json);
          return meta.complete && meta.sourceReviewId === report.id;
        });
        setExistingId(response?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [report.document_id, report.id]);

  async function create() {
    setDrafting(true);
    setError(null);
    try {
      const { reportId } = await apiSend<{ reportId: string }>(
        `/api/reports/${report.id}/rebuttal-letter`,
        "POST",
      );
      router.push(`/reports/${reportId}`);
    } catch (err) {
      setError(messageOf(err));
      setDrafting(false);
    }
  }

  return { existingId, drafting, error, create };
}

function ResponseLetterButton({
  letter,
  idleLabel,
  busyLabel,
}: {
  letter: ReturnType<typeof useResponseLetter>;
  idleLabel: string;
  busyLabel: string;
}) {
  if (letter.existingId) {
    return (
      <Link
        href={`/reports/${letter.existingId}`}
        className="no-print inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-oxford px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(41,83,196,0.7)] transition-all hover:-translate-y-px hover:bg-oxford-mid sm:w-auto"
      >
        View response letter →
      </Link>
    );
  }
  return (
    <Button
      onClick={letter.create}
      disabled={letter.drafting || letter.existingId === undefined}
      className="no-print min-h-11 w-full sm:w-auto"
    >
      {letter.drafting ? <Spinner /> : null}
      {letter.drafting
        ? busyLabel
        : letter.existingId === undefined
          ? "Checking for response…"
          : idleLabel}
    </Button>
  );
}

function PeerReviewView({
  review,
  report,
  programme,
}: {
  review: PeerReviewResult;
  report: ReportRow;
  programme: ProgrammeTemplate | null;
}) {
  const letter = useResponseLetter(report);

  return (
    <div className="space-y-6">
      <VerdictBanner verdict={review.recommendation} programme={programme} />

      <Card className="anim-rise p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl text-ink">Editorial summary</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{review.summary}</p>
          </div>
          <ResponseLetterButton letter={letter} idleLabel="Draft response letter" busyLabel="Drafting response…" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          These are asynchronous written comments, like a journal decision packet—not a live
          interview. Drafting creates an editable point-by-point response.
        </p>
      </Card>

      {letter.error ? <ErrorBanner message={letter.error} /> : null}

      <div className="space-y-5" aria-label="Written reviewer reports">
        {PEER_REVIEWER_ORDER.map((reviewer, reviewerIndex) => {
          const meta = PEER_REVIEWER_META[reviewer];
          const comments = review.sections.filter((section) => section.reviewer === reviewer);
          const headingId = `${report.id}-${reviewer}`;
          return (
            <section
              key={reviewer}
              aria-labelledby={headingId}
              className={`anim-rise overflow-hidden rounded-2xl border ${meta.accent}`}
              style={{ "--d": `${100 + reviewerIndex * 90}ms` } as CSSProperties}
            >
              <header className="border-b border-line/70 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={headingId} className="font-display text-2xl text-ink">
                    {meta.label}
                  </h2>
                  {reviewer === "reviewer_2" ? <Chip tone="brass">Most hostile</Chip> : null}
                  <span className="ml-auto text-xs tabular-nums text-ink-faint">
                    {comments.length} comments
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-ink-soft">{meta.remit}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {review.reviewer_summaries[reviewer]}
                </p>
              </header>
              <ol className="divide-y divide-line/70">
                {comments.map((comment, index) => (
                  <li key={`${reviewer}-${index}`} className="px-5 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm text-ink">
                        {reviewer.slice(-1)}.{index + 1}
                      </span>
                      <Chip
                        tone={
                          comment.severity === "major"
                            ? "red"
                            : comment.severity === "moderate"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {comment.severity}
                      </Chip>
                      <span className="text-xs text-ink-faint">{comment.section_hint}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink">{comment.comment}</p>
                    <blockquote className="mt-2 border-l-2 border-oxford/40 pl-3 font-display text-sm italic text-ink-soft">
                      “{comment.anchor_quote}”
                    </blockquote>
                    <div className="mt-3 rounded-xl border border-oxford/15 bg-oxford-faint px-3.5 py-3 text-sm leading-relaxed text-oxford-deep">
                      <span className="font-semibold">Suggested revision:</span>{" "}
                      {comment.suggestion}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      <Card className="anim-rise p-5" style={{ "--d": "390ms" } as CSSProperties}>
        <h2 className="font-display text-xl text-ink">Revision priorities</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink">
          {review.top_actions.map((action, index) => (
            <li key={index}>{action}</li>
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
      <div className="no-print flex flex-wrap items-center gap-2">
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
        className="no-print w-full rounded-2xl border border-line bg-card p-5 font-mono text-[13px] leading-relaxed text-ink focus:border-oxford focus:outline-none"
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

/* ------------------------------------------------------------------ */
/* Imported real reviewer comments — revision plan                     */
/* ------------------------------------------------------------------ */

const CATEGORY_TONE: Record<ImportedCommentCategory, ChipTone> = {
  major: "red",
  minor: "amber",
  editorial: "neutral",
};

const STANCE_TONE: Record<ImportedCommentStance, ChipTone> = {
  agree_revise: "green",
  clarify: "navy",
  partially_agree: "brass",
  respectfully_disagree: "amber",
};

const CATEGORY_FILTERS: ("all" | ImportedCommentCategory)[] = ["all", "major", "minor", "editorial"];

function ImportedReviewView({
  review,
  report,
  programme,
}: {
  review: ImportedReviewResult;
  report: ReportRow;
  programme: ProgrammeTemplate | null;
}) {
  const letter = useResponseLetter(report);
  // Ticked revision steps are a per-browser convenience, not shared state.
  const storageKey = `aiphd-revision-${report.id}`;
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [filter, setFilter] = useState<"all" | ImportedCommentCategory>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function toggle(key: string) {
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDone(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Private browsing: progress just won't survive a reload.
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
    } catch {
      // Clipboard blocked — the text is still selectable on the page.
    }
  }

  const actionKeys = review.comments.flatMap((c) => c.actions.map((_, i) => `${c.id}:${i}`));
  const doneCount = actionKeys.filter((key) => done.has(key)).length;
  const progress = actionKeys.length > 0 ? doneCount / actionKeys.length : 0;
  const counts = {
    major: review.comments.filter((c) => c.category === "major").length,
    minor: review.comments.filter((c) => c.category === "minor").length,
    editorial: review.comments.filter((c) => c.category === "editorial").length,
  };
  const experiments = review.comments.filter((c) => c.effort === "substantial").length;
  const visible = review.comments.filter((c) => filter === "all" || c.category === filter);
  const reviewerOrder = [...new Set(review.comments.map((c) => c.reviewer))];

  return (
    <div className="space-y-6">
      {review.decision !== "unknown" ? (
        <VerdictBanner verdict={review.decision} programme={programme} />
      ) : null}

      <Card className="anim-rise p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#a8843c" }}>
              Real reviewer comments
            </p>
            <h2 className="mt-1 font-display text-xl text-ink">What the reviewers want</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{review.editor_summary}</p>
          </div>
          <ResponseLetterButton
            letter={letter}
            idleLabel="Assemble response letter"
            busyLabel="Assembling letter…"
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          The letter is built from the draft replies below — no extra AI call — and opens for
          editing. Placeholders like [ADD: …] mark facts only you can supply.
        </p>
      </Card>

      {letter.error ? <ErrorBanner message={letter.error} /> : null}

      <Card className="anim-rise p-5" style={{ "--d": "80ms" } as CSSProperties}>
        <SectionLabel>Revision strategy</SectionLabel>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {review.strategy.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ol>
      </Card>

      <Card className="anim-rise no-print p-5" style={{ "--d": "140ms" } as CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel>Revision progress</SectionLabel>
          <span className="text-sm tabular-nums text-ink-soft">
            {doneCount} / {actionKeys.length} steps done
          </span>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress * 100}%`,
              background: progress === 1 ? "#2eb87a" : "linear-gradient(90deg,#a8843c,#2953c4)",
            }}
          />
        </div>
        <p className="mt-2.5 text-xs text-ink-faint">
          {review.comments.length} comments · {counts.major} major · {counts.minor} minor ·{" "}
          {counts.editorial} editorial
          {experiments > 0
            ? ` · ${experiments} need${experiments === 1 ? "s" : ""} new experiments`
            : ""}
        </p>
      </Card>

      <div className="no-print flex flex-wrap gap-1.5" role="tablist" aria-label="Filter comments">
        {CATEGORY_FILTERS.map((option) => {
          const selected = filter === option;
          const count = option === "all" ? review.comments.length : counts[option];
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(option)}
              className="rounded-full border px-3 py-1.5 text-[12px] font-medium capitalize transition-all duration-200 active:scale-[0.96]"
              style={
                selected
                  ? { background: "#0a1626", borderColor: "#0a1626", color: "#f0d9a0" }
                  : { background: "#fffdf8", borderColor: "var(--color-line)", color: "#5b6673" }
              }
            >
              {option} ({count})
            </button>
          );
        })}
      </div>

      {reviewerOrder.map((reviewer) => {
        const comments = visible.filter((c) => c.reviewer === reviewer);
        if (comments.length === 0) return null;
        const summary = review.reviewers.find((r) => r.label === reviewer)?.summary;
        return (
          <section key={`${reviewer}-${filter}`} aria-label={reviewer} className="space-y-3">
            <div>
              <h2 className="font-display text-2xl text-ink">{reviewer}</h2>
              {summary ? <p className="mt-1 text-sm text-ink-soft">{summary}</p> : null}
            </div>
            {comments.map((c, i) => (
              <article
                key={c.id}
                className="anim-rise-sm rounded-2xl border bg-card p-5"
                style={
                  {
                    "--d": `${i * 50}ms`,
                    borderColor: c.category === "major" ? "rgba(226,96,79,0.35)" : "var(--color-line)",
                  } as CSSProperties
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-base text-ink">{c.id}</span>
                  <Chip tone={CATEGORY_TONE[c.category]}>{c.category}</Chip>
                  <Chip tone={STANCE_TONE[c.stance]}>{IMPORTED_STANCE_LABELS[c.stance]}</Chip>
                  <Chip tone="muted">{IMPORTED_EFFORT_LABELS[c.effort]}</Chip>
                  {c.manuscript_anchor ? (
                    <span className="ml-auto text-xs text-ink-faint">{c.manuscript_anchor}</span>
                  ) : null}
                </div>
                <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-brass/60 pl-3 font-display text-[15px] italic leading-relaxed text-ink-soft">
                  {c.text}
                </blockquote>
                <p className="mt-3 text-sm leading-relaxed text-ink">
                  <span className="font-semibold text-oxford">How to solve it. </span>
                  {c.suggestion}
                </p>
                {c.actions.length > 0 ? (
                  <ul className="mt-2.5 space-y-1.5">
                    {c.actions.map((action, index) => {
                      const key = `${c.id}:${index}`;
                      const checked = done.has(key);
                      return (
                        <li key={key}>
                          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(key)}
                              className="mt-0.5 h-4 w-4 flex-none accent-oxford"
                            />
                            <span
                              className="transition-colors duration-300"
                              style={{
                                color: checked ? "#98a1ab" : "var(--color-ink)",
                                textDecoration: checked ? "line-through" : "none",
                              }}
                            >
                              {action}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                <details className="mt-3 rounded-xl bg-oxford-faint px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-oxford">
                    Draft response
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {c.draft_response}
                  </p>
                  <button
                    type="button"
                    onClick={() => copy(c.id, c.draft_response)}
                    className="no-print mt-2 text-xs font-medium text-oxford transition-colors hover:text-oxford-mid"
                  >
                    {copiedId === c.id ? "Copied ✓" : "Copy reply"}
                  </button>
                </details>
              </article>
            ))}
          </section>
        );
      })}
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
    const parsed = parseDocReviewResult(report);
    if (!parsed || isPeerReviewResult(parsed)) return;
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
  const imported = report.type === "doc_review" ? parseImportedReview(report.rubric_json) : null;
  const review =
    !isViva && !imported && report.type === "doc_review" ? parseDocReviewResult(report) : null;
  const peerReview = review && isPeerReviewResult(review) ? review : null;
  const documentReview = review && !isPeerReviewResult(review) ? review : null;
  const comparison = reviewComparison?.reportId === report.id ? reviewComparison : null;
  const responseSourceId =
    report.type === "rebuttal_letter" ? responseLetterMeta(report.rubric_json).sourceReviewId : null;
  const backHref = responseSourceId
    ? `/reports/${responseSourceId}`
    : report.session_id
      ? `/sessions/${report.session_id}`
      : report.document_id
        ? `/documents/${report.document_id}`
        : "/";

  return (
    <div className="mx-auto max-w-[880px] px-5 py-11 md:px-9">
      <Link
        href={backHref}
        className="no-print text-sm text-ink-faint hover:text-oxford"
      >
        ← {responseSourceId ? "Reviewer comments" : "Back"}
      </Link>
      <header className="anim-rise mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[32px] font-normal text-ink">
            {isViva
              ? "Viva assessment report"
              : report.type === "rebuttal_letter"
                ? "Response to reviewers"
                : imported
                  ? "Reviewer comments — revision plan"
                  : peerReview
                    ? "Written reviewer comments"
                    : "Document review"}
          </h1>
          <button
            onClick={() => window.print()}
            className="no-print ml-auto flex min-h-11 items-center gap-1.5 px-1 text-xs text-ink-faint transition-colors hover:text-oxford"
            title="Print-optimized — hand it to your supervisor"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M4.5 6.5v-4h7v4M4.5 12.5h-2v-6h11v6h-2M5.5 10.5h5v3h-5v-3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            Print / save as PDF
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-faint">{formatDateTime(report.created_at)}</p>
      </header>

      {report.type === "rebuttal_letter" ? (
        <RebuttalLetterView report={report} />
      ) : isViva && assessment ? (
        <VivaAssessmentView report={report} assessment={assessment} programme={programme} />
      ) : imported ? (
        <ImportedReviewView key={report.id} review={imported} report={report} programme={programme} />
      ) : peerReview ? (
        <PeerReviewView key={report.id} review={peerReview} report={report} programme={programme} />
      ) : documentReview ? (
        <DocReviewView review={documentReview} programme={programme} comparison={comparison} />
      ) : (
        <Card className="p-6">
          <Markdown>{report.content_md}</Markdown>
        </Card>
      )}
    </div>
  );
}
