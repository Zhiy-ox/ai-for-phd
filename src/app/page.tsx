"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSessionStyle, type ProgrammeTemplate, type StageTemplate } from "@/lib/template";
import type { StageInstance } from "@/lib/db/repos/stage-instances";
import type { DocumentSummary } from "@/lib/db/repos/documents";
import type { SessionRow } from "@/lib/db/repos/sessions";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { AppSettings } from "@/lib/db/repos/settings";
import { apiGet, apiSend, formatDate, formatDateTime, messageOf } from "@/components/api";
import { KindBadge, ProviderBadge, StageStatusChip } from "@/components/status-chip";
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  PageLoading,
  SectionLabel,
  Spinner,
} from "@/components/ui";

interface ProgrammeResponse {
  programme: ProgrammeTemplate;
  instances: StageInstance[];
}

interface StageInfo {
  docs: DocumentSummary[];
  sessions: SessionRow[];
  reports: ReportRow[];
}

function pickCurrentStageId(
  programme: ProgrammeTemplate,
  instances: StageInstance[],
  settings: AppSettings | null,
): string {
  const stages = [...programme.stages].sort((a, b) => a.ordinal - b.ordinal);
  if (settings?.current_stage && stages.some((s) => s.id === settings.current_stage)) {
    return settings.current_stage;
  }
  const byStage = new Map(instances.map((i) => [i.stage_id, i]));
  const active = stages.find(
    (s) => byStage.get(s.id)?.status === "active" && s.gate.type !== "recurring",
  );
  return (active ?? stages.find((s) => byStage.get(s.id)?.status === "active") ?? stages[0]).id;
}

// The single most useful thing to do next in this stage.
function nextStep(
  stage: StageTemplate,
  info: StageInfo,
): { text: string; href: string; cta: string } {
  const style = getSessionStyle(stage);
  const readable = info.docs.filter((d) => d.has_text);
  const live = info.sessions.find((s) => s.status === "active");
  const primaryDoc = stage.requiredDocuments[0]?.title.toLowerCase() ?? "document";

  if (live) {
    return {
      text: `A ${style.label.toLowerCase()} is in progress — the panel is waiting for you.`,
      href: `/sessions/${live.id}`,
      cta: "Resume session",
    };
  }
  if (readable.length === 0) {
    return {
      text: `Start by uploading your ${primaryDoc} — the AI reads it in full before any feedback or interview.`,
      href: `/stages/${stage.id}?tab=documents`,
      cta: "Upload document",
    };
  }
  if (info.reports.length === 0) {
    return {
      text: "Your document is in. Get rubric-scored feedback before facing anyone.",
      href: `/stages/${stage.id}?tab=documents`,
      cta: "Get feedback",
    };
  }
  if (stage.assessment && info.sessions.length === 0) {
    return {
      text: `Feedback in hand — time to face the panel in a ${style.label.toLowerCase()}.`,
      href: `/stages/${stage.id}?tab=viva`,
      cta: `Begin ${style.label.toLowerCase()}`,
    };
  }
  return {
    text: "Work the latest report's weaknesses into the next draft, then go again.",
    href: `/reports/${info.reports[0].id}`,
    cta: "Open latest report",
  };
}

/* ------------------------------------------------------------------ */
/* Current stage focus panel                                           */
/* ------------------------------------------------------------------ */

function CurrentStagePanel({
  stage,
  instance,
  info,
}: {
  stage: StageTemplate;
  instance?: StageInstance;
  info: StageInfo | null;
}) {
  const style = getSessionStyle(stage);
  return (
    <Card className="border-oxford/25 p-6 shadow-sm">
      <SectionLabel>Current stage</SectionLabel>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-2xl text-oxford">{stage.title}</h2>
        {instance ? <StageStatusChip status={instance.status} /> : null}
        {stage.gate.formRef ? <Chip tone="brass">{stage.gate.formRef}</Chip> : null}
        <span className="ml-auto text-xs text-ink-faint">
          {stage.typicalTiming.label}
          {instance?.target_date ? ` · target ${formatDate(instance.target_date)}` : ""}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
        {stage.description}
      </p>

      {info === null ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-ink-faint">
          <Spinner className="h-4 w-4 text-oxford" /> Loading stage activity…
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-lg bg-oxford-faint px-4 py-3">
            <p className="text-sm text-ink">
              <span className="font-medium text-oxford">Next: </span>
              {nextStep(stage, info).text}
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <SectionLabel>Documents ({info.docs.length})</SectionLabel>
              {info.docs.length === 0 ? (
                <p className="mt-2 text-sm text-ink-faint">None yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {info.docs.slice(0, 3).map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm">
                      <Link
                        href={`/documents/${d.id}`}
                        className="truncate text-oxford hover:underline"
                      >
                        {d.filename}
                      </Link>
                      <KindBadge kind={d.kind} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <SectionLabel>Sessions ({info.sessions.length})</SectionLabel>
              {info.sessions.length === 0 ? (
                <p className="mt-2 text-sm text-ink-faint">None yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {info.sessions.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Link href={`/sessions/${s.id}`} className="text-oxford hover:underline">
                        {formatDateTime(s.created_at)}
                      </Link>
                      <ProviderBadge provider={s.provider} />
                      {s.status === "active" ? <Chip tone="green">live</Chip> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <SectionLabel>Reports ({info.reports.length})</SectionLabel>
              {info.reports.length === 0 ? (
                <p className="mt-2 text-sm text-ink-faint">None yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {info.reports.slice(0, 3).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <Link href={`/reports/${r.id}`} className="text-oxford hover:underline">
                        {r.type === "viva_assessment" ? "Assessment" : "Review"}
                      </Link>
                      {r.verdict ? <Chip tone="brass">{r.verdict}</Chip> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={nextStep(stage, info).href}>
              <Button>{nextStep(stage, info).cta}</Button>
            </Link>
            <Link href={`/stages/${stage.id}`}>
              <Button variant="secondary">Enter stage</Button>
            </Link>
            {stage.assessment ? (
              <Link href={`/stages/${stage.id}?tab=viva`}>
                <Button variant="ghost">{style.label} →</Button>
              </Link>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* "Where am I?" panel                                                 */
/* ------------------------------------------------------------------ */

function WhereAmIPanel({
  stages,
  currentStageId,
  onApplied,
}: {
  stages: StageTemplate[];
  currentStageId: string;
  onApplied: (stageId: string, instances: StageInstance[]) => void;
}) {
  const [value, setValue] = useState(currentStageId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const { instances } = await apiSend<{ instances: StageInstance[] }>(
        "/api/programme/current-stage",
        "POST",
        { stageId: value },
      );
      onApplied(value, instances);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionLabel>Where are you in the DPhil?</SectionLabel>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-oxford focus:outline-none"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={apply} disabled={saving || value === currentStageId}>
          {saving ? <Spinner /> : null} Set current stage
        </Button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        Earlier stages are marked passed, later ones upcoming (Papers &amp; Rebuttals stays
        active once reached). You can fine-tune any stage&apos;s status on its own page.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Compact journey                                                     */
/* ------------------------------------------------------------------ */

function JourneyRow({
  stage,
  instance,
  isCurrent,
  isLast,
}: {
  stage: StageTemplate;
  instance?: StageInstance;
  isCurrent: boolean;
  isLast: boolean;
}) {
  const status = instance?.status ?? "upcoming";
  return (
    <li className="relative pl-9">
      {!isLast ? (
        <span aria-hidden className="absolute left-[11px] top-7 h-full w-px bg-line" />
      ) : null}
      <span
        aria-hidden
        className={`absolute left-1 top-4 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${
          status === "passed"
            ? "border-emerald-500 bg-emerald-500"
            : status === "active"
              ? "border-oxford bg-white"
              : "border-line bg-paper"
        }`}
      >
        {status === "active" ? <span className="h-1 w-1 rounded-full bg-oxford" /> : null}
      </span>
      <Link href={`/stages/${stage.id}`} className="block">
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border bg-white px-4 py-2.5 transition-colors hover:border-oxford/40 ${
            isCurrent ? "border-oxford/40" : "border-line"
          }`}
        >
          <span
            className={`font-display text-sm ${isCurrent ? "text-oxford" : "text-ink-soft"}`}
          >
            {stage.title}
          </span>
          <StageStatusChip status={status} />
          {stage.gate.formRef ? <Chip tone="brass">{stage.gate.formRef}</Chip> : null}
          <span className="ml-auto text-xs text-ink-faint">{stage.typicalTiming.label}</span>
        </div>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const [data, setData] = useState<ProgrammeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  // Tagged with the stage it was fetched for; a mismatch renders as loading.
  const [stageInfo, setStageInfo] = useState<(StageInfo & { stageId: string }) | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<ProgrammeResponse>("/api/programme"),
      apiGet<AppSettings>("/api/settings").catch(() => null),
    ])
      .then(([programmeData, settings]) => {
        setData(programmeData);
        setCurrentStageId(
          pickCurrentStageId(programmeData.programme, programmeData.instances, settings),
        );
      })
      .catch((e) => setError(messageOf(e)));
  }, []);

  useEffect(() => {
    if (!currentStageId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ documents }, { sessions }, { reports }] = await Promise.all([
          apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${currentStageId}`),
          apiGet<{ sessions: SessionRow[] }>(`/api/sessions?stageId=${currentStageId}`),
          apiGet<{ reports: ReportRow[] }>("/api/reports"),
        ]);
        if (cancelled) return;
        const sessionIds = new Set(sessions.map((s) => s.id));
        const docIds = new Set(documents.map((d) => d.id));
        setStageInfo({
          stageId: currentStageId,
          docs: documents,
          sessions,
          reports: reports.filter(
            (r) =>
              (r.session_id && sessionIds.has(r.session_id)) ||
              (r.document_id && docIds.has(r.document_id)),
          ),
        });
      } catch {
        if (!cancelled) {
          setStageInfo({ stageId: currentStageId, docs: [], sessions: [], reports: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStageId]);

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (!data || !currentStageId) return <PageLoading label="Loading your programme…" />;

  const { programme, instances } = data;
  const byStage = new Map(instances.map((i) => [i.stage_id, i]));
  const stages = [...programme.stages].sort((a, b) => a.ordinal - b.ordinal);
  const currentStage = stages.find((s) => s.id === currentStageId) ?? stages[0];

  return (
    <div>
      <header className="mb-8">
        <SectionLabel>{programme.name}</SectionLabel>
        <h1 className="mt-2 font-display text-2xl leading-tight text-oxford md:text-3xl">
          Your doctorate, rehearsed before it&apos;s real.
        </h1>
      </header>

      <div className="space-y-6">
        <CurrentStagePanel
          stage={currentStage}
          instance={byStage.get(currentStage.id)}
          info={stageInfo?.stageId === currentStage.id ? stageInfo : null}
        />

        <WhereAmIPanel
          stages={stages}
          currentStageId={currentStage.id}
          onApplied={(stageId, newInstances) => {
            setData({ programme, instances: newInstances });
            setCurrentStageId(stageId);
          }}
        />

        <div>
          <SectionLabel>The full journey</SectionLabel>
          <ol className="mt-3 space-y-2">
            {stages.map((stage, i) => (
              <JourneyRow
                key={stage.id}
                stage={stage}
                instance={byStage.get(stage.id)}
                isCurrent={stage.id === currentStage.id}
                isLast={i === stages.length - 1}
              />
            ))}
          </ol>
        </div>

        {programme.institutionNote ? (
          <p className="max-w-2xl text-xs leading-relaxed text-ink-faint">
            {programme.institutionNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
