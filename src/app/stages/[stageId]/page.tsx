"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSessionStyle,
  hasLivePanel,
  hasWrittenPeerReview,
  type ProgrammeTemplate,
  type StageTemplate,
} from "@/lib/template";
import type { StageInstance, StageStatus } from "@/lib/db/repos/stage-instances";
import type { DocumentSummary } from "@/lib/db/repos/documents";
import type { SessionRow } from "@/lib/db/repos/sessions";
import type { ReportSummary } from "@/lib/db/repos/reports";
import type { ProviderId } from "@/lib/providers/types";
import type { PanelStyle } from "@/lib/viva/types";
import { getPersonality, PANEL_PERSONALITIES } from "@/lib/viva/personalities";
import type { FindingRow, FindingStatus } from "@/lib/db/repos/findings";
import type { PanelProgress, StageActivity } from "@/lib/db/repos/stage-activity";
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

function DocumentsTab({
  stage,
  mode,
  onActivity,
}: {
  stage: StageTemplate;
  mode: "submit" | "feedback";
  onActivity?: () => void;
}) {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const feedbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();

  const load = useCallback(() => {
    apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${stage.id}`)
      .then((r) => {
        setDocs(r.documents);
      })
      .catch((e) => setError(messageOf(e)));
  }, [stage.id]);

  useEffect(load, [load]);

  // Move focus to the feedback heading once per entry into the Feedback
  // step. Later document reloads (an upload in the dropzone above) must not
  // yank focus and scroll away from where the user is working.
  const focusedEntryRef = useRef(false);
  useEffect(() => {
    if (mode !== "feedback") {
      focusedEntryRef.current = false;
      return;
    }
    if (docs === null || focusedEntryRef.current) return;
    focusedEntryRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const heading = feedbackHeadingRef.current;
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [docs, mode]);

  async function review(docId: string) {
    setReviewing(docId);
    setError(null);
    try {
      const { reportId } = await apiSend<{ reportId: string }>(
        `/api/documents/${docId}/review`,
        "POST",
        { stageId: stage.id },
      );
      onActivity?.();
      router.push(`/reports/${reportId}`);
    } catch (err) {
      setError(messageOf(err));
      setReviewing(null);
    }
  }

  const primaryDocument =
    stage.requiredDocuments[0]?.title.toLowerCase() ?? `${stage.title.toLowerCase()} document`;
  const peerReview = hasWrittenPeerReview(stage);

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
        onUploaded={() => {
          load();
          onActivity?.();
        }}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section
        aria-labelledby={mode === "feedback" ? "feedback-actions-title" : undefined}
        className={
          mode === "feedback"
            ? "scroll-mt-6 rounded-2xl border border-oxford/30 bg-oxford-faint p-5"
            : undefined
        }
      >
        {mode === "feedback" ? (
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oxford">
              {peerReview ? "Written peer review" : "Feedback workspace"}
            </p>
            <h2
              id="feedback-actions-title"
              ref={feedbackHeadingRef}
              tabIndex={-1}
              className="mt-1 scroll-mt-24 font-display text-2xl text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxford focus-visible:ring-offset-4 focus-visible:ring-offset-oxford-faint"
            >
              {peerReview
                ? "Generate comments from Reviewer 1, Reviewer 2, and Reviewer 3"
                : "Choose a document for rubric-scored feedback"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {peerReview
                ? "This is a written referee packet, not a live interview. Each reviewer returns numbered comments and concrete revision suggestions; Reviewer 2 is always the most hostile, while remaining professional."
                : "Use “Get feedback” on any document with extracted text. Your review will open as a scored report with concrete actions."}
            </p>
            {peerReview ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Fixed reviewer panel">
                {[
                  ["Reviewer 1", "Constructive methods & reproducibility"],
                  ["Reviewer 2", "Most hostile · novelty & soundness"],
                  ["Reviewer 3", "Significance, framing & clarity"],
                ].map(([name, remit], index) => (
                  <div
                    key={name}
                    className={`rounded-xl border px-3 py-3 ${
                      index === 1
                        ? "border-brass/50 bg-gold-bg"
                        : "border-line bg-white/80"
                    }`}
                  >
                    <p className="font-display text-sm text-ink">{name}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{remit}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {docs === null ? (
          <PageLoading label="Loading documents…" />
        ) : docs.length === 0 ? (
          <EmptyState
            title="No documents yet"
            hint={
              peerReview
                ? `Upload your ${primaryDocument} above to generate three written reviewer reports.`
                : `Upload your ${primaryDocument} above to get rubric-based feedback${hasLivePanel(stage) ? " and prepare the assessment panel." : "."}`
            }
          />
        ) : (
          <ul className="space-y-2">
            {docs.map((doc, i) => (
              <li key={doc.id} className="anim-rise-sm" style={{ "--d": `${i * 60}ms` } as CSSProperties}>
                <Card className="flex flex-wrap items-center gap-3 p-4 transition-shadow hover:shadow-md">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="font-medium text-oxford hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oxford focus-visible:ring-offset-2"
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
                    {peerReview && doc.kind !== "paper" ? (
                      <Chip tone="muted">supporting file · manuscript required</Chip>
                    ) : (
                      <Button
                        variant="secondary"
                        className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oxford focus-visible:ring-offset-2"
                        disabled={!doc.has_text || reviewing !== null}
                        onClick={() => review(doc.id)}
                      >
                        {reviewing === doc.id ? <Spinner /> : null}
                        {reviewing === doc.id
                          ? peerReview
                            ? "Three reviewers are reading…"
                            : "Reviewing your document…"
                          : peerReview
                            ? "Generate reviewer comments"
                            : "Get feedback"}
                      </Button>
                    )}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
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

function VivaTab({
  stage,
  onActivity,
}: {
  stage: StageTemplate;
  onActivity?: () => void;
}) {
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
      onActivity?.();
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
        {hasLivePanel(stage)
          ? "Harvested from assessments and reviews. The panel re-attacks open items in every session until they are resolved."
          : hasWrittenPeerReview(stage)
            ? "Harvested from written referee comments. Major and moderate points stay here until you resolve them."
            : "Harvested from document reviews. Open items stay on your ledger until you resolve them."}
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
        report: ReportSummary;
        session?: SessionRow;
      }[]
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ reports: ReportSummary[] }>(
        `/api/reports?stageId=${stage.id}&summary=1`,
      ),
      apiGet<{ sessions: SessionRow[] }>(`/api/sessions?stageId=${stage.id}`),
    ])
      .then(([r, s]) => {
        const sessionIds = new Map(s.sessions.map((x) => [x.id, x]));
        setRows(
          r.reports
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
    const primaryDocument =
      stage.requiredDocuments[0]?.title.toLowerCase() ?? `${stage.title.toLowerCase()} document`;
    return (
      <div>
        <WeaknessLedger stage={stage} />
        <EmptyState
          title="No reports yet"
          hint="Assessment reports collect here as you work the loop:"
        >
          <GuideSteps
            steps={[
              `Upload your ${primaryDocument} in Submit.`,
              hasWrittenPeerReview(stage)
                ? "Open Reviewer comments and generate three written referee reports."
                : "Open Feedback and request a rubric-scored review.",
              ...(hasLivePanel(stage)
                ? ["Complete the panel exercise — its assessment and weakness ledger follow."]
                : hasWrittenPeerReview(stage)
                  ? ["Open the reviewer packet, prioritise the major comments, then draft your response."]
                  : ["Open the review to work through its rubric scores and weakness ledger."]),
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
                {report.type === "viva_assessment"
                  ? "Viva assessment"
                  : report.type === "rebuttal_letter"
                    ? "Response to reviewers"
                    : hasWrittenPeerReview(stage)
                      ? "Reviewer comments"
                      : "Document review"}
              </span>
              {report.verdict ? (
                <Chip tone="brass">{report.verdict.replace(/_/g, " ")}</Chip>
              ) : null}
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
/* Guided stepper                                                      */
/* ------------------------------------------------------------------ */

type StepId = "submit" | "feedback" | "panel" | "record";
type StepState = PanelProgress;

interface StageStep {
  id: StepId;
  title: string;
  hint: string;
  state: StepState;
}

const STEP_VIEW: Record<StepId, Tab> = {
  submit: "documents",
  feedback: "documents",
  panel: "viva",
  record: "reports",
};

const STEP_IDS: readonly StepId[] = ["submit", "feedback", "panel", "record"];

function stepFromSearch(search: string): StepId {
  const query = new URLSearchParams(search);
  const step = query.get("step");
  if (step && STEP_IDS.includes(step as StepId)) return step as StepId;

  // Keep bookmarks from the former tab strip working while new links use ?step=.
  const tab = query.get("tab");
  if (tab === "viva") return "panel";
  if (tab === "reports") return "record";
  if (tab === "feedback") return "feedback";
  return "submit";
}

function stepsFor(stage: StageTemplate, activity: StageActivity): StageStep[] {
  return [
    {
      id: "submit",
      title: "Submit",
      hint: stage.requiredDocuments[0]?.title ?? "Upload your document",
      state: activity.readable > 0 ? "complete" : "not_started",
    },
    {
      id: "feedback",
      title: hasWrittenPeerReview(stage) ? "Reviewer comments" : "Feedback",
      hint: hasWrittenPeerReview(stage) ? "Reviewer 1 / 2 / 3" : "Rubric-scored review",
      state: activity.reviews > 0 ? "complete" : "not_started",
    },
    ...(hasLivePanel(stage)
      ? [
          {
            id: "panel" as StepId,
            title: "Face the panel",
            hint: `${getSessionStyle(stage).label} or drill`,
            state: activity.panelState,
          },
        ]
      : []),
    {
      id: "record",
      title: "The record",
      hint: "Reports & weakness ledger",
      state: activity.reports > 0 ? "complete" : "not_started",
    },
  ];
}

function StageStepper({
  steps,
  currentId,
  onSelect,
}: {
  steps: StageStep[];
  currentId: StepId;
  onSelect: (id: StepId) => void;
}) {
  return (
    <nav aria-label="Stage progress" className="mb-7">
      <ol
        className="grid items-start"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => {
          const current = step.id === currentId;
          const complete = step.state === "complete";
          const connectorComplete = complete;
          return (
            <li key={step.id} className="relative min-w-0">
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-[21px] h-px transition-colors duration-500"
                style={{
                  left: "calc(50% + 24px)",
                  right: "calc(-50% + 24px)",
                  background: connectorComplete ? "#1f7a52" : "#d8d2c2",
                }}
              />
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={current ? "step" : undefined}
              className="relative z-10 mx-auto flex min-h-11 w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl px-1 py-0.5 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oxford focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.97]"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] text-[13px] font-semibold transition-all duration-300"
                style={
                  current
                    ? {
                        background: "#2953c4",
                        borderColor: "#2953c4",
                        color: "#fff",
                        boxShadow: "0 0 0 4px rgba(41,83,196,0.15)",
                      }
                    : complete
                      ? { background: "#1f7a52", borderColor: "#1f7a52", color: "#fff" }
                      : step.state === "in_progress"
                        ? { background: "#f3ead2", borderColor: "#8b6a24", color: "#6f541c" }
                        : { background: "#fffdf8", borderColor: "#b8b09f", color: "#5b6673" }
                }
              >
                {complete ? (
                  <svg viewBox="0 0 10 10" className="h-4 w-4">
                    <path
                      d="M2 5.2 4.2 7.4 8 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className="text-[12.5px] leading-tight transition-colors"
                style={{ fontWeight: current ? 600 : 500, color: current ? "#16202e" : "#5b6673" }}
              >
                <span className="sr-only">
                  {complete
                    ? "Completed. "
                    : step.state === "in_progress"
                      ? "In progress. "
                      : "Not completed. "}
                  {current ? "Current step. " : ""}
                </span>
                {step.title}
              </span>
              <span className="hidden text-[11px] leading-snug text-ink-soft sm:block">
                {step.hint}
              </span>
              {step.state === "in_progress" ? (
                <span className="text-[10px] font-semibold text-[#6f541c]">In progress</span>
              ) : null}
            </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StageProgressLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-7 flex min-h-24 items-center justify-center gap-2 rounded-xl border border-line bg-white/70 px-4 py-5 text-sm text-ink-soft"
    >
      <Spinner className="h-4 w-4 text-oxford" />
      Checking stage progress…
    </div>
  );
}

function StageProgressError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-7 flex min-h-24 flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Stage progress is unavailable</p>
        <p className="mt-0.5 text-xs leading-relaxed text-red-700">{message}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type ActivityLoadState =
  | { status: "loading"; stageId: string }
  | { status: "ready"; stageId: string; activity: StageActivity }
  | { status: "error"; stageId: string; message: string };

export default function StagePage() {
  const params = useParams<{ stageId: string }>();
  const stageId = params.stageId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ProgrammeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stepId = stepFromSearch(searchParams.toString());
  const [activityState, setActivityState] = useState<ActivityLoadState>({
    status: "loading",
    stageId,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpActivity = useCallback(() => setRefreshKey((k) => k + 1), []);
  const retryActivity = useCallback(() => {
    setActivityState({ status: "loading", stageId });
    setRefreshKey((k) => k + 1);
  }, [stageId]);

  const selectStep = useCallback(
    (next: StepId) => {
      const query = new URLSearchParams(window.location.search);
      query.set("step", next);
      query.delete("tab");
      const suffix = query.toString();
      router.push(
        `${window.location.pathname}${suffix ? `?${suffix}` : ""}${window.location.hash}`,
        { scroll: false },
      );
    },
    [router],
  );

  useEffect(() => {
    apiGet<ProgrammeResponse>("/api/programme")
      .then(setData)
      .catch((e) => setError(messageOf(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ activity: StageActivity }>(`/api/stages/${stageId}/activity`)
      .then(({ activity }) => {
        if (cancelled) return;
        setActivityState({ status: "ready", stageId, activity });
      })
      .catch((e) => {
        if (!cancelled) {
          setActivityState({ status: "error", stageId, message: messageOf(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stageId, refreshKey]);

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

  const availableSteps: StepId[] = hasLivePanel(stage)
    ? ["submit", "feedback", "panel", "record"]
    : ["submit", "feedback", "record"];
  const currentStep = availableSteps.includes(stepId)
    ? stepId
    : hasWrittenPeerReview(stage) && stepId === "panel"
      ? "feedback"
      : "submit";
  const view = STEP_VIEW[currentStep];
  const activityForStage =
    activityState.stageId === stageId && activityState.status === "ready"
      ? activityState.activity
      : null;
  const steps = activityForStage ? stepsFor(stage, activityForStage) : null;

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
          <div className="anim-rise" style={{ "--d": "140ms" } as CSSProperties}>
            {steps ? (
              <StageStepper steps={steps} currentId={currentStep} onSelect={selectStep} />
            ) : activityState.stageId === stageId && activityState.status === "error" ? (
              <StageProgressError message={activityState.message} onRetry={retryActivity} />
            ) : (
              <StageProgressLoading />
            )}
          </div>
          {/* Every URL-backed destination gets a fresh entrance and focus pass. */}
          <div key={currentStep} className="anim-rise-sm">
            {view === "documents" ? (
              <DocumentsTab
                stage={stage}
                mode={currentStep === "feedback" ? "feedback" : "submit"}
                onActivity={bumpActivity}
              />
            ) : null}
            {view === "viva" ? <VivaTab stage={stage} onActivity={bumpActivity} /> : null}
            {view === "reports" ? <ReportsTab stage={stage} /> : null}
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
