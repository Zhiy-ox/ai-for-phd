"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSessionStyle, type ProgrammeTemplate, type StageTemplate } from "@/lib/template";
import type { StageInstance, StageStatus } from "@/lib/db/repos/stage-instances";
import type { DocumentSummary } from "@/lib/db/repos/documents";
import type { SessionRow } from "@/lib/db/repos/sessions";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { ProviderId } from "@/lib/providers/types";
import {
  ACTIVITY_LABELS,
  apiGet,
  apiSend,
  formatDateTime,
  messageOf,
  STAGE_PRIMARY_KIND,
} from "@/components/api";
import { KindBadge, ProviderBadge, StageStatusChip } from "@/components/status-chip";
import { ProviderPicker } from "@/components/provider-picker";
import { UploadDropzone } from "@/components/upload-dropzone";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionLabel,
  Spinner,
} from "@/components/ui";

interface ProgrammeResponse {
  programme: ProgrammeTemplate;
  instances: StageInstance[];
}

type Tab = "documents" | "viva" | "reports";

const STAGE_STATUSES: StageStatus[] = ["upcoming", "active", "passed", "referred", "locked"];

/* ------------------------------------------------------------------ */
/* Stage header: status, target date, notes                            */
/* ------------------------------------------------------------------ */

function StageHeader({
  stage,
  instance,
  onSaved,
}: {
  stage: StageTemplate;
  instance: StageInstance | null;
  onSaved: (i: StageInstance) => void;
}) {
  const [status, setStatus] = useState<StageStatus>(instance?.status ?? "upcoming");
  const [targetDate, setTargetDate] = useState(instance?.target_date ?? "");
  const [notes, setNotes] = useState(instance?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    status !== (instance?.status ?? "upcoming") ||
    targetDate !== (instance?.target_date ?? "") ||
    notes !== (instance?.notes ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { instance: updated } = await apiSend<{ instance: StageInstance }>(
        `/api/stages/${stage.id}`,
        "PATCH",
        { status, targetDate: targetDate || null, notes: notes || null },
      );
      onSaved(updated);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-ink-soft">
          <span className="mb-1 block text-xs text-ink-faint">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StageStatus)}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-oxford focus:outline-none"
          >
            {STAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          <span className="mb-1 block text-xs text-ink-faint">Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-oxford focus:outline-none"
          />
        </label>
        <label className="min-w-64 flex-1 text-sm text-ink-soft">
          <span className="mb-1 block text-xs text-ink-faint">Notes</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. assessors confirmed, submit report by week 2"
            className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-oxford focus:outline-none"
          />
        </label>
        <Button variant="secondary" onClick={save} disabled={!dirty || saving}>
          {saving ? <Spinner /> : null} Save
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Documents tab                                                       */
/* ------------------------------------------------------------------ */

function DocumentsTab({ stage }: { stage: StageTemplate }) {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(() => {
    apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${stage.id}`)
      .then((r) => setDocs(r.documents))
      .catch((e) => setError(messageOf(e)));
  }, [stage.id]);

  useEffect(load, [load]);

  async function review(docId: string) {
    setReviewing(docId);
    setError(null);
    try {
      const { reportId } = await apiSend<{ reportId: string }>(
        `/api/documents/${docId}/review`,
        "POST",
        { stageId: stage.id },
      );
      router.push(`/reports/${reportId}`);
    } catch (err) {
      setError(messageOf(err));
      setReviewing(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Expected documents</SectionLabel>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          {stage.requiredDocuments.map((d) => (
            <li key={d.id}>
              <span className="font-medium text-ink">{d.title}</span> — {d.description}
            </li>
          ))}
        </ul>
      </div>

      <UploadDropzone
        stageId={stage.id}
        defaultKind={STAGE_PRIMARY_KIND[stage.id] ?? "other"}
        onUploaded={load}
      />

      {error ? <ErrorBanner message={error} /> : null}

      {docs === null ? (
        <PageLoading label="Loading documents…" />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          hint="Upload your transfer report draft to get rubric-based feedback and to arm the mock viva panel."
        />
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <Link
                  href={`/documents/${doc.id}`}
                  className="font-medium text-oxford hover:underline"
                >
                  {doc.filename}
                </Link>
                <KindBadge kind={doc.kind} />
                {doc.has_text ? (
                  <Chip tone="green">text ✓</Chip>
                ) : (
                  <Chip tone="amber" title={doc.extract_error ?? undefined}>
                    extraction failed
                  </Chip>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={!doc.has_text || reviewing !== null}
                    onClick={() => review(doc.id)}
                  >
                    {reviewing === doc.id ? <Spinner /> : null}
                    {reviewing === doc.id ? "Panel is reading…" : "Get feedback"}
                  </Button>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mock viva tab                                                       */
/* ------------------------------------------------------------------ */

function VivaTab({ stage }: { stage: StageTemplate }) {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [supporting, setSupporting] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    apiGet<{ settings: { default_provider: ProviderId } } | { default_provider: ProviderId }>(
      "/api/settings",
    )
      .then((s) => {
        const dp = "default_provider" in s ? s.default_provider : s.settings.default_provider;
        if (dp) setProvider(dp);
      })
      .catch(() => {});
    apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${stage.id}`)
      .then((r) => {
        const usable = r.documents.filter((d) => d.has_text);
        setDocs(usable);
        const preferredKind = STAGE_PRIMARY_KIND[stage.id];
        const report = usable.find((d) => d.kind === preferredKind) ?? usable[0];
        if (report) setPrimary(report.id);
      })
      .catch((e) => setError(messageOf(e)));
  }, [stage.id]);

  async function begin() {
    if (!primary) return;
    setStarting(true);
    setError(null);
    try {
      const documentIds = [primary, ...[...supporting].filter((id) => id !== primary)];
      const { session } = await apiSend<{ session: SessionRow }>("/api/sessions", "POST", {
        stageId: stage.id,
        provider,
        documentIds,
      });
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setError(messageOf(err));
      setStarting(false);
    }
  }

  const panel = stage.assessment?.panel ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <SectionLabel>Your panel</SectionLabel>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {panel.map((p) => (
            <div key={p.id} className="rounded-lg bg-oxford-faint p-4">
              <p className="font-display text-base text-oxford">{p.name}</p>
              <p className="text-xs uppercase tracking-wide text-ink-faint">{p.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.style}</p>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <SectionLabel>Assessor backend</SectionLabel>
        <div className="mt-2">
          <ProviderPicker value={provider} onChange={setProvider} disabled={starting} />
        </div>
      </div>

      <div>
        <SectionLabel>Documents before the panel</SectionLabel>
        {docs === null ? (
          <PageLoading label="Loading documents…" />
        ) : docs.length === 0 ? (
          <EmptyState
            title="No readable documents"
            hint="The panel needs the document under examination. Upload it in the Documents tab first."
          />
        ) : (
          <ul className="mt-2 space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm"
              >
                <label className="flex items-center gap-2 font-medium text-ink">
                  <input
                    type="radio"
                    name="primary"
                    checked={primary === doc.id}
                    onChange={() => setPrimary(doc.id)}
                    className="accent-oxford"
                  />
                  {doc.filename}
                </label>
                <KindBadge kind={doc.kind} />
                <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={supporting.has(doc.id)}
                    disabled={primary === doc.id}
                    onChange={(e) => {
                      const next = new Set(supporting);
                      if (e.target.checked) next.add(doc.id);
                      else next.delete(doc.id);
                      setSupporting(next);
                    }}
                    className="accent-oxford"
                  />
                  supporting
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          The radio selects the report under examination; checked documents go in as
          supporting material.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <Button onClick={begin} disabled={!primary || starting}>
        {starting ? <Spinner /> : null}
        {starting
          ? "The panel is reading your submission…"
          : `Begin ${getSessionStyle(stage).label.toLowerCase()}`}
      </Button>
      {starting ? (
        <p className="text-xs text-ink-faint">
          The assessors are preparing a question plan from your report — this takes a
          minute or so.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reports tab                                                         */
/* ------------------------------------------------------------------ */

function ReportsTab({ stage }: { stage: StageTemplate }) {
  const [rows, setRows] = useState<
    | {
        report: ReportRow;
        session?: SessionRow;
      }[]
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ reports: ReportRow[] }>("/api/reports"),
      apiGet<{ sessions: SessionRow[] }>(`/api/sessions?stageId=${stage.id}`),
      apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${stage.id}`),
    ])
      .then(([r, s, d]) => {
        const sessionIds = new Map(s.sessions.map((x) => [x.id, x]));
        const docIds = new Set(d.documents.map((x) => x.id));
        setRows(
          r.reports
            .filter(
              (rep) =>
                (rep.session_id && sessionIds.has(rep.session_id)) ||
                (rep.document_id && docIds.has(rep.document_id)),
            )
            .map((rep) => ({
              report: rep,
              session: rep.session_id ? sessionIds.get(rep.session_id) : undefined,
            })),
        );
      })
      .catch((e) => setError(messageOf(e)));
  }, [stage.id]);

  if (error) return <ErrorBanner message={error} />;
  if (rows === null) return <PageLoading label="Loading reports…" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No reports yet"
        hint="Run a document review or complete a mock viva and the assessment reports will collect here."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map(({ report, session }) => (
        <li key={report.id}>
          <Link href={`/reports/${report.id}`} className="block">
            <Card className="flex flex-wrap items-center gap-3 p-4 transition-shadow hover:shadow-md">
              <span className="font-medium text-oxford">
                {report.type === "viva_assessment" ? "Viva assessment" : "Document review"}
              </span>
              {report.verdict ? <Chip tone="brass">{report.verdict}</Chip> : null}
              {session ? <ProviderBadge provider={session.provider} /> : null}
              <span className="ml-auto text-xs text-ink-faint">
                {formatDateTime(report.created_at)}
              </span>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function StagePage() {
  const params = useParams<{ stageId: string }>();
  const stageId = params.stageId;
  const [data, setData] = useState<ProgrammeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?tab=viva|reports deep-links from the dashboard. Safe to read location in
  // the initializer: nothing tab-dependent renders until data has loaded.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "documents";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "viva" || t === "reports" ? t : "documents";
  });

  useEffect(() => {
    apiGet<ProgrammeResponse>("/api/programme")
      .then(setData)
      .catch((e) => setError(messageOf(e)));
  }, []);

  const stage = useMemo(
    () => data?.programme.stages.find((s) => s.id === stageId),
    [data, stageId],
  );
  // Server truth arrives with `data`; successful PATCHes override it locally.
  const [instanceOverride, setInstanceOverride] = useState<StageInstance | null>(null);
  const instance =
    instanceOverride ?? data?.instances.find((i) => i.stage_id === stageId) ?? null;

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (!data) return <PageLoading label="Loading stage…" />;
  if (!stage) {
    return <ErrorBanner tone="red" message={`Unknown stage: ${stageId}`} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "documents", label: "Documents" },
    // Only stages with a panel get an interview tab (thesis is review-only).
    ...(stage.assessment
      ? [{ id: "viva" as Tab, label: getSessionStyle(stage).label }]
      : []),
    { id: "reports", label: "Reports" },
  ];

  return (
    <div>
      <Link href="/" className="text-sm text-ink-faint hover:text-oxford">
        ← Journey
      </Link>
      <header className="mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-oxford">{stage.title}</h1>
          {instance ? <StageStatusChip status={instance.status} /> : null}
          {stage.gate.formRef ? <Chip tone="brass">{stage.gate.formRef}</Chip> : null}
          <span className="text-xs text-ink-faint">{stage.typicalTiming.label}</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          {stage.description}
        </p>
      </header>

      <div className="mb-6">
        <StageHeader stage={stage} instance={instance} onSaved={setInstanceOverride} />
      </div>

      {stage.implemented ? (
        <>
          <div className="mb-6 flex gap-1 border-b border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                  tab === t.id
                    ? "border-oxford font-medium text-oxford"
                    : "border-transparent text-ink-faint hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "documents" ? <DocumentsTab stage={stage} /> : null}
          {tab === "viva" ? <VivaTab stage={stage} /> : null}
          {tab === "reports" ? <ReportsTab stage={stage} /> : null}
        </>
      ) : (
        <EmptyState
          title="This stage is coming soon"
          hint="This stage isn't interactive yet. Here's what it will offer:"
        >
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {stage.activities.map((a) => (
              <Chip key={a} tone="muted">
                {ACTIVITY_LABELS[a]}
              </Chip>
            ))}
          </div>
          {stage.requiredDocuments.length > 0 ? (
            <ul className="mt-4 space-y-1 text-left text-sm text-ink-soft">
              {stage.requiredDocuments.map((d) => (
                <li key={d.id}>
                  <span className="font-medium text-ink">{d.title}</span> — {d.description}
                </li>
              ))}
            </ul>
          ) : null}
        </EmptyState>
      )}
    </div>
  );
}
