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
import type { PanelStyle } from "@/lib/viva/types";
import { getPersonality, PANEL_PERSONALITIES } from "@/lib/viva/personalities";
import type { FindingRow, FindingStatus } from "@/lib/db/repos/findings";
import {
  ACTIVITY_LABELS,
  apiGet,
  apiSend,
  formatDateTime,
  messageOf,
  STAGE_PRIMARY_KIND,
} from "@/components/api";
import { KindBadge, ProviderBadge, StageStatusChip } from "@/components/status-chip";
import { CountdownChip } from "@/components/countdown";
import { ProviderPicker } from "@/components/provider-picker";
import { UploadDropzone } from "@/components/upload-dropzone";
import {
  Burst,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  GuideSteps,
  PageLoading,
  SectionLabel,
  Spinner,
} from "@/components/ui";
import type { CSSProperties } from "react";

interface ProgrammeResponse {
  programme: ProgrammeTemplate;
  instances: StageInstance[];
}

type Tab = "documents" | "viva" | "reports";

const STAGE_STATUSES: StageStatus[] = ["upcoming", "active", "passed", "referred", "locked"];

/* ------------------------------------------------------------------ */
/* Stage header: status, target date, notes                            */
/* ------------------------------------------------------------------ */

// Selected-pill accent per status — passed reads green, referred brass, &c.
const STATUS_PILL_COLOR: Record<StageStatus, string> = {
  upcoming: "#5b6673",
  active: "#2953c4",
  passed: "#2eb87a",
  referred: "#a8843c",
  locked: "#98a1ab",
};

const SOFT_INPUT =
  "rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink transition-all focus:border-oxford focus:shadow-[0_0_0_3px_rgba(41,83,196,0.12)] focus:outline-none";

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
  const [savedFlash, setSavedFlash] = useState(false);
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
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-xs text-ink-faint">Status</span>
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-line bg-white p-1">
            {STAGE_STATUSES.map((s) => {
              const selected = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className="rounded-xl px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-all duration-300 active:scale-[0.96]"
                  style={
                    selected
                      ? {
                          background: STATUS_PILL_COLOR[s],
                          color: "#fff",
                          boxShadow: `0 6px 14px -8px ${STATUS_PILL_COLOR[s]}`,
                        }
                      : { color: "#5b6673" }
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-soft">
            <span className="mb-1.5 block text-xs text-ink-faint">Target date</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={SOFT_INPUT}
            />
          </label>
          <label className="min-w-56 flex-1 text-sm text-ink-soft">
            <span className="mb-1.5 block text-xs text-ink-faint">Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. assessors confirmed, submit report by week 2"
              className={`w-full ${SOFT_INPUT}`}
            />
          </label>
          <div className="flex h-[38px] items-center">
            {dirty ? (
              <span className="anim-rise-sm">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Spinner /> : null} Save
                </Button>
              </span>
            ) : savedFlash ? (
              <span className="anim-pop flex items-center gap-1.5 px-2 text-sm font-medium" style={{ color: "#1f7a52" }}>
                <svg viewBox="0 0 10 10" className="h-3 w-3" aria-hidden="true">
                  <path d="M2 5.2 4.2 7.4 8 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Saved
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {error ? <p className="anim-rise-sm mt-2 text-sm text-red-700">{error}</p> : null}
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
          {docs.map((doc, i) => (
            <li key={doc.id} className="anim-rise-sm" style={{ "--d": `${i * 60}ms` } as CSSProperties}>
              <Card className="flex flex-wrap items-center gap-3 p-4 transition-shadow hover:shadow-md">
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

// Preset interrogation targets offered as chips; the free-text field covers
// anything document-specific ("the statistics in section 4").
const TARGET_PRESETS = [
  "methodology & controls",
  "statistics & uncertainties",
  "novelty of the contribution",
  "literature positioning",
  "feasibility of the plan",
  "writing & clarity",
];

function VivaTab({ stage }: { stage: StageTemplate }) {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [supporting, setSupporting] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [intensity, setIntensity] = useState<PanelStyle["intensity"]>("standard");
  const [mode, setMode] = useState<"viva" | "drill">("viva");
  const [focus, setFocus] = useState("");
  const [targets, setTargets] = useState<Set<string>>(new Set());
  // Persona id → personality archetype id; absent = as written in the template.
  const [personas, setPersonas] = useState<Record<string, string>>({});
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
    if (!primary && mode !== "drill") return;
    setStarting(true);
    setError(null);
    try {
      const documentIds = primary
        ? [primary, ...[...supporting].filter((id) => id !== primary)]
        : [];
      const focusParts = [...targets];
      if (focus.trim()) focusParts.push(focus.trim());
      const style: PanelStyle = {
        intensity,
        focus: focusParts.length ? focusParts.join("; ") : undefined,
        personas: Object.keys(personas).length ? personas : undefined,
      };
      const { session } = await apiSend<{ session: SessionRow }>("/api/sessions", "POST", {
        stageId: stage.id,
        provider,
        documentIds,
        style,
        mode,
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
        <p className="mt-1 text-xs text-ink-faint">
          Each assessor&apos;s personality is yours to cast — rehearse against the examiner you fear.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {panel.map((p, i) => {
            const chosen = personas[p.id];
            const archetype = chosen ? getPersonality(chosen) : undefined;
            return (
              <div
                key={p.id}
                className="anim-rise-sm rounded-lg bg-oxford-faint p-4"
                style={{ "--d": `${i * 90}ms` } as CSSProperties}
              >
                <p className="font-display text-base text-oxford">{p.name}</p>
                <p className="text-xs uppercase tracking-wide text-ink-faint">
                  {p.role}
                  {archetype ? ` · ${archetype.label}` : ""}
                </p>
                {/* Keyed so a personality change re-runs the entrance animation. */}
                <p key={chosen ?? "as-written"} className="anim-fade mt-2 min-h-[60px] text-sm leading-relaxed text-ink-soft">
                  {archetype ? archetype.style : p.style}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    { id: undefined, label: "As written", blurb: "The template persona, unchanged." },
                    ...PANEL_PERSONALITIES,
                  ].map((opt) => {
                    const selected = chosen === opt.id || (!chosen && opt.id === undefined);
                    return (
                      <button
                        key={opt.id ?? "as-written"}
                        type="button"
                        disabled={starting}
                        title={opt.blurb}
                        onClick={() =>
                          setPersonas((prev) => {
                            const next = { ...prev };
                            if (opt.id === undefined) delete next[p.id];
                            else next[p.id] = opt.id;
                            return next;
                          })
                        }
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 hover:-translate-y-px active:scale-[0.95]"
                        style={
                          selected
                            ? { background: "#2953c4", borderColor: "#2953c4", color: "#fff", boxShadow: "0 6px 14px -8px rgba(41,83,196,0.8)" }
                            : { background: "#fffdf8", borderColor: "var(--color-line)", color: "#5b6673" }
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <SectionLabel>Assessor backend</SectionLabel>
        <div className="mt-2">
          <ProviderPicker value={provider} onChange={setProvider} disabled={starting} />
        </div>
      </div>

      <div>
        <SectionLabel>Session type</SectionLabel>
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          {(
            [
              {
                id: "viva",
                title: getSessionStyle(stage).label,
                blurb: "The full formal session: two panellists, ~12–15 questions, ends in a verdict report.",
              },
              {
                id: "drill",
                title: "Quick-fire drill",
                blurb: "~10 minutes, one examiner, 8 rapid questions with instant feedback — prioritizes your open weaknesses. No document needed.",
              },
            ] as { id: "viva" | "drill"; title: string; blurb: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              disabled={starting}
              className="rounded-xl border-[1.5px] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-20px_rgba(10,22,38,0.5)] active:translate-y-0 active:scale-[0.98]"
              style={{
                borderColor: mode === opt.id ? "#2953c4" : "var(--color-line)",
                background: mode === opt.id ? "#e8eef9" : "#fffdf8",
                boxShadow: mode === opt.id ? "0 10px 24px -18px rgba(41,83,196,0.6)" : undefined,
              }}
            >
              <p className="text-sm font-semibold text-ink">{opt.title}</p>
              <p className="mt-1 text-[12px] leading-snug text-ink-soft">{opt.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Examiner style</SectionLabel>
        <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
          {(
            [
              {
                id: "supportive",
                title: "Supportive",
                blurb: "Early rehearsal — rigorous but warm, hints allowed.",
              },
              {
                id: "standard",
                title: "Standard",
                blurb: "A realistic panel: fair, exacting, follow-up pressure.",
              },
              {
                id: "hostile",
                title: "Hostile",
                blurb: "Your worst day: cold, terse, three-deep follow-ups.",
              },
            ] as { id: PanelStyle["intensity"]; title: string; blurb: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setIntensity(opt.id)}
              disabled={starting}
              className="rounded-xl border-[1.5px] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-20px_rgba(10,22,38,0.5)] active:translate-y-0 active:scale-[0.98]"
              style={{
                borderColor: intensity === opt.id ? "#2953c4" : "var(--color-line)",
                background: intensity === opt.id ? "#e8eef9" : "#fffdf8",
                boxShadow: intensity === opt.id ? "0 10px 24px -18px rgba(41,83,196,0.6)" : undefined,
              }}
            >
              <p className="text-sm font-semibold text-ink">{opt.title}</p>
              <p className="mt-1 text-[12px] leading-snug text-ink-soft">{opt.blurb}</p>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <p className="text-xs text-ink-faint">Press me especially on…</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {TARGET_PRESETS.map((t) => {
              const selected = targets.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={starting}
                  onClick={() =>
                    setTargets((prev) => {
                      const next = new Set(prev);
                      if (next.has(t)) next.delete(t);
                      else next.add(t);
                      return next;
                    })
                  }
                  className="rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all duration-200 hover:-translate-y-px active:scale-[0.95]"
                  style={
                    selected
                      ? { background: "#0a1626", borderColor: "#0a1626", color: "#f0d9a0" }
                      : { background: "#fffdf8", borderColor: "var(--color-line)", color: "#5b6673" }
                  }
                >
                  {selected ? "✓ " : ""}
                  {t}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            disabled={starting}
            placeholder="…or anything specific: 'the statistics in section 4' (optional)"
            className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink transition-all focus:border-oxford focus:shadow-[0_0_0_3px_rgba(41,83,196,0.12)] focus:outline-none"
          />
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

      <Button onClick={begin} disabled={(!primary && mode !== "drill") || starting}>
        {starting ? <Spinner /> : null}
        {starting
          ? mode === "drill"
            ? "Setting up the drill…"
            : "The panel is reading your submission…"
          : mode === "drill"
            ? "Begin quick-fire drill"
            : `Begin ${getSessionStyle(stage).label.toLowerCase()}`}
      </Button>
      {starting ? (
        <p className="anim-rise-sm animate-pulse text-xs text-ink-faint">
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

function WeaknessLedger({ stage }: { stage: StageTemplate }) {
  const [findings, setFindings] = useState<FindingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A just-resolved item celebrates and slides out before the list reloads.
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ findings: FindingRow[] }>(`/api/findings?stageId=${stage.id}`)
      .then((r) => setFindings(r.findings))
      .catch((e) => setError(messageOf(e)));
  }, [stage.id]);
  useEffect(load, [load]);

  async function setStatus(id: string, status: FindingStatus) {
    try {
      if (status === "resolved") {
        setResolvingId(id);
        await apiSend(`/api/findings/${id}`, "PATCH", { status });
        setTimeout(() => {
          setResolvingId(null);
          load();
        }, 750);
        return;
      }
      await apiSend(`/api/findings/${id}`, "PATCH", { status });
      load();
    } catch (e) {
      setResolvingId(null);
      setError(messageOf(e));
    }
  }

  if (findings === null && !error) return null;
  const open = (findings ?? []).filter((f) => f.status !== "resolved");
  const resolved = (findings ?? []).filter((f) => f.status === "resolved");

  return (
    <div className="mb-6">
      <SectionLabel>Weakness ledger</SectionLabel>
      <p className="mt-1 text-xs text-ink-faint">
        Harvested from assessments and reviews. The panel re-attacks open items in
        every session until they are resolved.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">
          Nothing open{resolved.length > 0 ? ` — ${resolved.length} resolved` : ""}.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {open.map((f, i) => {
            const resolving = resolvingId === f.id;
            return (
              <li
                key={f.id}
                className="anim-rise-sm relative flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-700"
                style={
                  {
                    "--d": `${i * 60}ms`,
                    borderColor: resolving ? "rgba(46,184,122,0.6)" : "rgba(168,132,60,0.35)",
                    background: resolving ? "#eafaf2" : "#faf7ef",
                    opacity: resolving ? 0 : 1,
                    transform: resolving ? "translateX(28px) scale(0.97)" : undefined,
                    transitionDelay: resolving ? "0.25s" : undefined,
                  } as CSSProperties
                }
              >
                {resolving ? <Burst /> : null}
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm leading-snug text-ink">{f.description}</p>
                  {f.evidence ? (
                    <p className="mt-1 text-xs italic text-ink-faint">“{f.evidence}”</p>
                  ) : null}
                </div>
                <span className="flex items-center gap-2">
                  <Chip tone={f.status === "improving" ? "green" : "amber"}>{f.status}</Chip>
                  <Button
                    variant="secondary"
                    disabled={resolvingId !== null}
                    onClick={() => setStatus(f.id, "resolved")}
                  >
                    {resolving ? "Resolved ✓" : "Resolve"}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {resolved.length > 0 && open.length > 0 ? (
        <p className="mt-2 text-xs text-ink-faint">{resolved.length} resolved and retired.</p>
      ) : null}
    </div>
  );
}

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
      <div>
        <WeaknessLedger stage={stage} />
        <EmptyState
          title="No reports yet"
          hint="Assessment reports collect here as you work the loop:"
        >
          <GuideSteps
            steps={[
              "Upload your draft in the Documents tab.",
              "Press “Get feedback” — a rubric-scored review lands here.",
              "Face the panel — the viva assessment and its weakness ledger follow.",
            ]}
          />
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <WeaknessLedger stage={stage} />
      <ul className="space-y-2">
      {rows.map(({ report, session }, i) => (
        <li key={report.id} className="anim-rise-sm" style={{ "--d": `${i * 60}ms` } as CSSProperties}>
          <Link href={`/reports/${report.id}`} className="block">
            <Card className="flex flex-wrap items-center gap-3 p-4 transition-all hover:-translate-y-px hover:shadow-md">
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
    </div>
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
    <div className="mx-auto max-w-[880px] px-5 py-11 md:px-9">
      <Link href="/" className="text-sm text-ink-faint hover:text-oxford">
        ← Journey
      </Link>
      <header className="anim-rise mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[38px] font-normal text-ink">{stage.title}</h1>
          {instance ? <StageStatusChip status={instance.status} /> : null}
          {stage.gate.formRef ? <Chip tone="brass">{stage.gate.formRef}</Chip> : null}
          {instance?.status !== "passed" ? <CountdownChip date={instance?.target_date} /> : null}
          <span className="text-xs text-ink-faint">{stage.typicalTiming.label}</span>
          <Link
            href={`/stages/${stage.id}/summary`}
            className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-oxford"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M4.5 6.5v-4h7v4M4.5 12.5h-2v-6h11v6h-2M5.5 10.5h5v3h-5v-3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            Supervisor summary
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          {stage.description}
        </p>
      </header>

      <div className="anim-rise mb-6" style={{ "--d": "80ms" } as CSSProperties}>
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
          {/* Keyed on the tab so every switch re-runs the entrance animation. */}
          <div key={tab} className="anim-rise-sm">
            {tab === "documents" ? <DocumentsTab stage={stage} /> : null}
            {tab === "viva" ? <VivaTab stage={stage} /> : null}
            {tab === "reports" ? <ReportsTab stage={stage} /> : null}
          </div>
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
