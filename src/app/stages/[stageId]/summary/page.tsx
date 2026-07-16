"use client";

// Supervisor export: a one-page, print-optimized gate-readiness summary the
// student can hand to their real supervisor. Everything interactive carries
// .no-print; the sheet itself prints clean on A4 in black and white.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ProgrammeTemplate, StageTemplate } from "@/lib/template";
import type { StageInstance } from "@/lib/db/repos/stage-instances";
import type { DocumentSummary } from "@/lib/db/repos/documents";
import type { SessionRow } from "@/lib/db/repos/sessions";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { FindingRow } from "@/lib/db/repos/findings";
import { apiGet, formatDate, formatDateTime, messageOf } from "@/components/api";
import { daysUntil, formatCountdown } from "@/lib/dates";
import { Button, ErrorBanner, PageLoading } from "@/components/ui";

interface ProgrammeResponse {
  programme: ProgrammeTemplate;
  instances: StageInstance[];
}

interface ScoredCriterion {
  id: string;
  score: number;
  comments?: string;
}

// Both report kinds store `{ criteria: [{id, score, ...}] }` in rubric_json.
function parseScores(report: ReportRow): ScoredCriterion[] | null {
  if (!report.rubric_json) return null;
  try {
    const parsed = JSON.parse(report.rubric_json) as { criteria?: unknown };
    if (!Array.isArray(parsed.criteria)) return null;
    const rows = parsed.criteria.filter(
      (c): c is ScoredCriterion =>
        Boolean(c) &&
        typeof (c as ScoredCriterion).id === "string" &&
        typeof (c as ScoredCriterion).score === "number",
    );
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

function criterionTitles(stage: StageTemplate): Map<string, string> {
  const map = new Map<string, string>();
  stage.reviewRubric?.forEach((c) => map.set(c.id, c.title));
  stage.assessment?.rubric.forEach((c) => map.set(c.id, c.title));
  return map;
}

function PrintBar() {
  return (
    <div className="no-print mb-6 flex items-center gap-3">
      <Button onClick={() => window.print()}>Print / save as PDF</Button>
      <p className="text-xs text-ink-faint">
        Prints as a single clean page — hand it to your supervisor before the real gate.
      </p>
    </div>
  );
}

export default function GateSummaryPage() {
  const params = useParams<{ stageId: string }>();
  const stageId = params.stageId;
  const [data, setData] = useState<{
    programme: ProgrammeTemplate;
    instance: StageInstance | null;
    docs: DocumentSummary[];
    sessions: SessionRow[];
    reports: ReportRow[];
    findings: FindingRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<ProgrammeResponse>("/api/programme"),
      apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${stageId}`),
      apiGet<{ sessions: SessionRow[] }>(`/api/sessions?stageId=${stageId}`),
      apiGet<{ reports: ReportRow[] }>("/api/reports"),
      apiGet<{ findings: FindingRow[] }>(`/api/findings?stageId=${stageId}`).catch(() => ({
        findings: [] as FindingRow[],
      })),
    ])
      .then(([prog, d, s, r, f]) => {
        const sessionIds = new Set(s.sessions.map((x) => x.id));
        const docIds = new Set(d.documents.map((x) => x.id));
        setData({
          programme: prog.programme,
          instance: prog.instances.find((i) => i.stage_id === stageId) ?? null,
          docs: d.documents,
          sessions: s.sessions,
          findings: f.findings,
          reports: r.reports.filter(
            (rep) =>
              (rep.session_id && sessionIds.has(rep.session_id)) ||
              (rep.document_id && docIds.has(rep.document_id)),
          ),
        });
      })
      .catch((e) => setError(messageOf(e)));
  }, [stageId]);

  const stage = useMemo(
    () => data?.programme.stages.find((s) => s.id === stageId),
    [data, stageId],
  );

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (!data) return <PageLoading label="Assembling the summary…" />;
  if (!stage) return <ErrorBanner tone="red" message={`Unknown stage: ${stageId}`} />;

  const { programme, instance, docs, sessions, reports, findings } = data;
  const titles = criterionTitles(stage);
  const readable = docs.filter((d) => d.has_text);
  const latestScored = reports.find((r) => parseScores(r));
  const scores = latestScored ? parseScores(latestScored)! : null;
  const latestVerdictReport = reports.find((r) => r.type === "viva_assessment" && r.verdict);
  const verdictLabel = latestVerdictReport
    ? (stage.assessment?.verdicts.find((v) => v.id === latestVerdictReport.verdict)?.label ??
      latestVerdictReport.verdict)
    : null;
  const open = findings.filter((f) => f.status === "open");
  const improving = findings.filter((f) => f.status === "improving");
  const resolved = findings.filter((f) => f.status === "resolved");
  const vivas = sessions.filter((s) => {
    try {
      return (JSON.parse(s.config_json) as { mode?: string }).mode !== "drill";
    } catch {
      return true;
    }
  });
  const drills = sessions.length - vivas.length;
  const targetDays = instance?.target_date ? daysUntil(instance.target_date) : null;
  const readiness = [
    { label: "Document uploaded", done: readable.length > 0 },
    { label: "Feedback in hand", done: reports.length > 0 },
    ...(stage.assessment ? [{ label: "Panel faced", done: sessions.length > 0 }] : []),
  ];

  return (
    <div className="print-sheet mx-auto max-w-[820px] px-5 py-11 md:px-9">
      <Link href={`/stages/${stage.id}`} className="no-print text-sm text-ink-faint hover:text-oxford">
        ← {stage.title}
      </Link>

      <header className="anim-rise mb-7 mt-3 border-b pb-5" style={{ borderColor: "#e5e0d2" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {programme.name} · Gate-readiness summary
        </p>
        <h1 className="mt-2 font-display text-[32px] font-normal leading-tight text-ink">
          {stage.title}
          {stage.gate.formRef ? (
            <span className="ml-3 align-middle font-display text-lg" style={{ color: "#a8843c" }}>
              {stage.gate.formRef}
            </span>
          ) : null}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-soft">
          <span>
            Status: <strong className="font-semibold text-ink">{instance?.status ?? "upcoming"}</strong>
          </span>
          <span>
            Target date:{" "}
            <strong className="font-semibold text-ink">
              {instance?.target_date ? formatDate(instance.target_date) : "not set"}
            </strong>
            {targetDays !== null ? ` (${formatCountdown(targetDays)})` : ""}
          </span>
          <span>Generated {formatDateTime(new Date().toISOString())}</span>
        </div>
        {instance?.notes ? (
          <p className="mt-2 text-[13px] italic text-ink-soft">Notes: {instance.notes}</p>
        ) : null}
      </header>

      <PrintBar />

      <section className="anim-rise mb-7" style={{ "--d": "60ms" } as CSSProperties}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          Preparation status
        </h2>
        <ul className="mt-2.5 flex flex-wrap gap-x-8 gap-y-1.5 text-sm">
          {readiness.map((r) => (
            <li key={r.label} className="flex items-center gap-2" style={{ color: r.done ? "#1f7a52" : "#98a1ab" }}>
              <span className="font-semibold">{r.done ? "✓" : "○"}</span>
              {r.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-ink-soft">
          {reports.filter((r) => r.type === "doc_review").length} rubric review
          {reports.filter((r) => r.type === "doc_review").length === 1 ? "" : "s"} ·{" "}
          {vivas.length} mock session{vivas.length === 1 ? "" : "s"}
          {drills > 0 ? ` · ${drills} quick-fire drill${drills === 1 ? "" : "s"}` : ""}
          {verdictLabel ? (
            <>
              {" "}
              · latest panel verdict: <strong className="font-semibold text-ink">{verdictLabel}</strong>
            </>
          ) : null}
        </p>
      </section>

      {scores ? (
        <section className="anim-rise mb-7" style={{ "--d": "120ms" } as CSSProperties}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
            Latest rubric scores{" "}
            <span className="normal-case tracking-normal">
              ({latestScored!.type === "viva_assessment" ? "panel assessment" : "document review"},{" "}
              {formatDate(latestScored!.created_at)})
            </span>
          </h2>
          <table className="mt-2.5 w-full text-sm">
            <tbody>
              {scores.map((c) => (
                <tr key={c.id} className="border-b align-top last:border-0" style={{ borderColor: "#eee9db" }}>
                  <td className="w-[220px] py-1.5 pr-4 font-medium text-ink">{titles.get(c.id) ?? c.id}</td>
                  <td className="w-[120px] py-1.5 pr-4">
                    <span className="font-display text-[15px] tabular-nums text-ink">{Math.max(0, Math.min(5, c.score))} / 5</span>
                    <span className="ml-2 tracking-[0.1em] text-ink-faint" aria-hidden="true">
                      {"●".repeat(Math.round(Math.max(0, Math.min(5, c.score))))}
                      {"○".repeat(5 - Math.round(Math.max(0, Math.min(5, c.score))))}
                    </span>
                  </td>
                  <td className="py-1.5 text-[13px] leading-relaxed text-ink-soft">{c.comments ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="anim-rise mb-7" style={{ "--d": "180ms" } as CSSProperties}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          Weakness ledger — {open.length} open · {improving.length} improving · {resolved.length} resolved
        </h2>
        {open.length === 0 && improving.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Nothing outstanding{resolved.length > 0 ? " — all raised weaknesses have been closed out." : " yet."}
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {[...open, ...improving].map((f) => (
              <li key={f.id} className="border-l-2 pl-3" style={{ borderColor: f.status === "improving" ? "#2eb87a" : "#a8843c" }}>
                <p className="text-sm leading-snug text-ink">
                  {f.description}
                  <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: f.status === "improving" ? "#1f7a52" : "#8b6a24" }}>
                    {f.status}
                  </span>
                </p>
                {f.evidence ? <p className="mt-0.5 text-[12.5px] italic text-ink-faint">“{f.evidence}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t pt-3 text-[11.5px] text-ink-faint" style={{ borderColor: "#e5e0d2" }}>
        Generated by AI for PhD — mock panels, rubric reviews, and a weakness ledger rehearsing{" "}
        {programme.name} gates before they&apos;re real. Scores are AI rehearsal signals, not official marks.
      </footer>
    </div>
  );
}
