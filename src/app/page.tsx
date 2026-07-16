"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { getSessionStyle, type ProgrammeTemplate, type StageTemplate } from "@/lib/template";
import type { StageInstance, StageStatus } from "@/lib/db/repos/stage-instances";
import type { DocumentSummary } from "@/lib/db/repos/documents";
import type { SessionRow } from "@/lib/db/repos/sessions";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { FindingRow } from "@/lib/db/repos/findings";
import type { AppSettings } from "@/lib/db/repos/settings";
import { apiGet, apiSend, formatDate, messageOf } from "@/components/api";
import { AnimatedCheck, ErrorBanner, PageLoading } from "@/components/ui";
import { CoachTour, TOUR_DONE_KEY, type TourStep } from "@/components/coach-tour";
import { CountdownChip, isGateUrgent } from "@/components/countdown";
import { daysUntil, formatCountdown } from "@/lib/dates";

interface ProgrammeResponse {
  programme: ProgrammeTemplate;
  instances: StageInstance[];
}

interface StageInfo {
  stageId: string;
  docs: DocumentSummary[];
  sessions: SessionRow[];
  reports: ReportRow[];
  findings: FindingRow[];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

// First-visit walkthrough. Steps whose data-tour target isn't on the page
// (e.g. no open weaknesses yet) are skipped automatically.
const TOUR_STEPS: TourStep[] = [
  {
    id: "rail",
    title: "Your whole doctorate, on one line",
    body: "Every formal gate of the programme, in order. Click any milestone to make it the stage you're working on — nothing has to happen in sequence.",
  },
  {
    id: "next-move",
    title: "Never wonder what to do next",
    body: "The app always names exactly one next action for your current gate: upload a draft, get feedback, or face the panel. When in doubt, press this button.",
  },
  {
    id: "readiness",
    title: "Three checks to gate-ready",
    body: "Document in, feedback in hand, panel faced. When all three light up green, you've rehearsed the gate end-to-end — before it counts.",
  },
  {
    id: "weaknesses",
    title: "The panel remembers",
    body: "Weaknesses found in feedback and mock vivas are kept on a ledger, and every future panel re-attacks them until you've closed them out.",
  },
  {
    id: "journey",
    title: "Jump anywhere, any time",
    body: "The full journey lives down here. Use “Work on this now” to switch stages — papers and rebuttals run alongside everything else.",
  },
];

// The numbered gates — everything except the recurring Papers & Rebuttals.
function gateStages(programme: ProgrammeTemplate): StageTemplate[] {
  return [...programme.stages]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((s) => s.gate.type !== "recurring");
}

function papersStage(programme: ProgrammeTemplate): StageTemplate | undefined {
  return programme.stages.find((s) => s.gate.type === "recurring");
}

function pickCurrentStageId(
  programme: ProgrammeTemplate,
  instances: StageInstance[],
  settings: AppSettings | null,
): string {
  const gates = gateStages(programme);
  if (settings?.current_stage && gates.some((s) => s.id === settings.current_stage)) {
    return settings.current_stage;
  }
  const byStage = new Map(instances.map((i) => [i.stage_id, i]));
  const active = gates.find((s) => byStage.get(s.id)?.status === "active");
  return (active ?? gates[0]).id;
}

interface NextMove {
  text: string;
  href: string;
  cta: string;
}

function nextMove(stage: StageTemplate, info: StageInfo | null): NextMove {
  const style = getSessionStyle(stage);
  if (!info) return { text: "Loading your stage…", href: `/stages/${stage.id}`, cta: "Enter stage" };
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
      text: `Upload your ${primaryDoc} — the AI reads it in full before any feedback or interview.`,
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

const STATUS_LABEL: Record<StageStatus, string> = {
  passed: "Complete",
  active: "In progress",
  upcoming: "Upcoming",
  locked: "Locked",
  referred: "Referred",
};
const STATUS_COLOR: Record<StageStatus, string> = {
  passed: "#2eb87a",
  active: "#2953c4",
  upcoming: "#98a1ab",
  locked: "#b3bac2",
  referred: "#a8843c",
};

/* ------------------------------------------------------------------ */
/* Milestone rail                                                      */
/* ------------------------------------------------------------------ */

// Compact countdown line for rail nodes — text only, colored by urgency.
function RailCountdown({ date }: { date: string }) {
  const days = daysUntil(date);
  if (days === null) return null;
  const color = days < 0 ? "#b3402f" : days <= 42 ? "#8b6a24" : "#98a1ab";
  return (
    <span className="text-[11px] font-semibold" style={{ color }}>
      {formatCountdown(days)}
    </span>
  );
}

function MilestoneRail({
  gates,
  byStage,
  currentId,
  onSetCurrent,
}: {
  gates: StageTemplate[];
  byStage: Map<string, StageInstance>;
  currentId: string;
  onSetCurrent: (id: string) => void;
}) {
  const currentIdx = Math.max(0, gates.findIndex((s) => s.id === currentId));
  const fill = gates.length > 1 ? (currentIdx / (gates.length - 1)) * 100 : 0;
  return (
    <div className="mt-12" data-tour="rail">
      <div className="relative h-0.5 rounded-full" style={{ background: "#e5e0d2" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${fill}%`, background: "linear-gradient(90deg,#a8843c,#2953c4)" }}
        />
        <span
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-700"
          style={{
            left: `${fill}%`,
            background: "#2953c4",
            animation: "sparkPulse 2.4s ease-in-out infinite",
          }}
        />
      </div>
      <div className="mt-[-9px] grid" style={{ gridTemplateColumns: `repeat(${gates.length},1fr)` }}>
        {gates.map((stage, i) => {
          const status = byStage.get(stage.id)?.status ?? "upcoming";
          const isCurrent = stage.id === currentId;
          const done = status === "passed";
          return (
            <div key={stage.id} className="flex flex-col items-start gap-2.5">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full border-2 box-border transition-colors duration-500"
                style={{
                  borderColor: done ? "#2eb87a" : isCurrent ? "#2953c4" : "#d8d2c2",
                  background: done ? "#2eb87a" : isCurrent ? "#fffdf8" : "#f5f2ea",
                }}
              >
                {done ? (
                  <svg viewBox="0 0 10 10" className="h-2 w-2">
                    <path d="M2 5.2 4.2 7.4 8 3" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isCurrent ? (
                  <span className="h-1 w-1 rounded-full" style={{ background: "#2953c4" }} />
                ) : null}
              </span>
              <button
                onClick={() => onSetCurrent(stage.id)}
                title="Set as current stage"
                className="flex flex-col gap-0.5 pr-3 text-left transition-transform hover:-translate-y-0.5"
              >
                <span className="font-display text-xs text-ink-faint">{ROMAN[i]}</span>
                <span
                  className="text-[12.5px] leading-tight"
                  style={{ fontWeight: isCurrent ? 600 : 400, color: isCurrent ? "#16202e" : "#5b6673" }}
                >
                  {stage.title}
                </span>
                <span className="text-[11px]" style={{ color: "#b3bac2" }}>
                  {stage.typicalTiming.label}
                </span>
                {!done && byStage.get(stage.id)?.target_date ? (
                  <RailCountdown date={byStage.get(stage.id)!.target_date!} />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gate-seal hero                                                      */
/* ------------------------------------------------------------------ */

function HeroCurrentStage({
  stage,
  instance,
  numeral,
  info,
  onEditStages,
}: {
  stage: StageTemplate;
  instance?: StageInstance;
  numeral: string;
  info: StageInfo | null;
  onEditStages: () => void;
}) {
  const move = nextMove(stage, info);
  const urgent = isGateUrgent(instance?.target_date);
  const targetDays = instance?.target_date ? daysUntil(instance.target_date) : null;
  const readable = (info?.docs ?? []).filter((d) => d.has_text);
  const readiness = [
    { label: "Document uploaded", done: readable.length > 0 },
    { label: "Feedback in hand", done: (info?.reports.length ?? 0) > 0 },
    ...(stage.assessment
      ? [{ label: "Panel faced", done: (info?.sessions.length ?? 0) > 0 }]
      : []),
  ];
  return (
    <section
      className="mt-11 overflow-hidden rounded-[20px] border"
      style={{ background: "#fffdf8", borderColor: "#e5e0d2", boxShadow: "0 24px 60px -36px rgba(10,22,38,0.35)" }}
    >
      <div className="grid md:grid-cols-[1.55fr_1fr]">
        <div className="p-8 md:p-10">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#a8843c" }}>
              Now · Gate {numeral}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: "#e8eef9", color: "#2953c4" }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#2953c4" }} />
              {STATUS_LABEL[instance?.status ?? "active"]}
            </span>
            <CountdownChip date={instance?.target_date} />
            <button
              onClick={onEditStages}
              className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-oxford"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                <path d="M11.5 2.5 13.5 4.5 5 13H3v-2l8.5-8.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Edit stages
            </button>
          </div>
          <h2 className="mt-3.5 font-display text-[36px] font-normal leading-tight text-ink">
            {stage.title}
          </h2>
          <p className="mt-3.5 max-w-[480px] text-[14.5px] leading-relaxed text-ink-soft">
            {stage.description}
          </p>

          <div
            className="mt-6 flex items-center gap-4 rounded-2xl px-5 py-4"
            style={{ background: "#0a1626" }}
            data-tour="next-move"
          >
            <div className="flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(240,217,160,0.8)" }}>
                Your next move
                {urgent && targetDays !== null ? (
                  <span className="ml-2 normal-case tracking-normal" style={{ color: "#f0d9a0" }}>
                    · gate {targetDays < 0 ? formatCountdown(targetDays) : `in ${formatCountdown(targetDays).replace(" left", "")}`} — every rehearsal counts
                  </span>
                ) : null}
              </p>
              <p className="mt-1.5 font-display text-[17px] leading-snug" style={{ color: "#f5f2ea" }}>
                {move.text}
              </p>
            </div>
            <Link
              href={move.href}
              className="group flex flex-none items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
              style={{ background: "#2953c4", boxShadow: "0 10px 24px -10px rgba(41,83,196,0.7)" }}
            >
              {move.cta}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              >
                <path d="M2.5 8h10.5M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {info && info.findings.length > 0 ? (
            <div
              className="anim-rise-sm mt-3 rounded-lg border px-4 py-3"
              style={{ borderColor: "rgba(168,132,60,0.35)", background: "#faf7ef" }}
              data-tour="weaknesses"
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#a8843c" }}>
                Open weaknesses ({info.findings.length}) — the panel remembers
              </p>
              <ul className="mt-1.5 space-y-1">
                {info.findings.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-[13px] leading-snug text-ink-soft">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                      style={{ background: f.status === "improving" ? "#2eb87a" : "#a8843c" }}
                    />
                    {f.description}
                  </li>
                ))}
              </ul>
              {info.findings.length > 3 ? (
                <Link
                  href={`/stages/${stage.id}?tab=reports`}
                  className="mt-1.5 inline-block text-xs font-medium text-oxford hover:underline"
                >
                  All {info.findings.length} →
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-5" data-tour="readiness">
            {readiness.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-2 text-[13px] transition-colors duration-300"
                style={{ color: r.done ? "#2eb87a" : "#98a1ab" }}
              >
                <AnimatedCheck done={r.done} />
                {r.label}
              </div>
            ))}
          </div>
        </div>

        {/* Gate seal */}
        <div
          className="relative flex flex-col items-center justify-center gap-4.5 border-l p-9"
          style={{ borderColor: "#eee9db", background: "linear-gradient(180deg,#faf7ef,#f3efe3)" }}
        >
          <div
            className="relative flex h-[118px] w-[118px] items-center justify-center rounded-full"
            style={{ border: "1.5px solid rgba(168,132,60,0.55)" }}
          >
            <div
              className="absolute inset-[7px] rounded-full"
              style={{ border: "1px dashed rgba(168,132,60,0.5)", animation: "spin 60s linear infinite" }}
            />
            <div className="text-center">
              <p className="font-display text-[22px]" style={{ color: "#a8843c" }}>
                {stage.gate.formRef ?? "—"}
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.2em]" style={{ color: "#b39355" }}>
                {stage.gate.formRef ? "Gate form" : "No form"}
              </p>
            </div>
          </div>
          <div className="mt-2 text-center">
            <p className="text-xs text-ink-faint">Target date</p>
            <p className="mt-0.5 font-display text-[19px] text-ink">
              {instance?.target_date ? formatDate(instance.target_date) : "Not set"}
            </p>
            {instance?.target_date ? (
              <p className="mt-1.5 flex justify-center">
                <CountdownChip date={instance.target_date} />
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding / stage-picker modal                                     */
/* ------------------------------------------------------------------ */

function OnboardingModal({
  programme,
  byStage,
  currentId,
  onSetCurrent,
  onClose,
}: {
  programme: ProgrammeTemplate;
  byStage: Map<string, StageInstance>;
  currentId: string;
  onSetCurrent: (id: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const gates = gateStages(programme);
  const papers = papersStage(programme);
  return (
    <div
      className="anim-fade fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: "rgba(10,22,38,0.55)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="anim-pop max-h-[86vh] w-full max-w-[580px] overflow-y-auto rounded-[22px] border p-9"
        style={{ background: "#fffdf8", borderColor: "#e5e0d2", boxShadow: "0 40px 100px -30px rgba(10,22,38,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
          Set up once, change anytime
        </p>
        <h2 className="mt-2.5 font-display text-[27px] font-normal text-ink">
          Where are you in the DPhil?
        </h2>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
          Choose the stage you&apos;re working on now. Earlier stages are marked complete, later
          ones upcoming — nothing here has to happen in order, and you can revisit this any time.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {gates.map((stage) => {
            const status = byStage.get(stage.id)?.status ?? "upcoming";
            const isCurrent = stage.id === currentId;
            return (
              <button
                key={stage.id}
                onClick={() => onSetCurrent(stage.id)}
                className="flex items-center gap-3.5 rounded-xl border-[1.5px] px-4 py-3 text-left transition-all hover:-translate-y-px active:scale-[0.99]"
                style={{
                  borderColor: isCurrent ? "#2953c4" : "#e5e0d2",
                  background: isCurrent ? "#e8eef9" : "#fff",
                }}
              >
                <span
                  className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-[1.5px] box-border"
                  style={{
                    borderColor: status === "passed" ? "#2eb87a" : "#d8d2c2",
                    background: status === "passed" ? "#2eb87a" : "transparent",
                  }}
                >
                  {status === "passed" ? (
                    <svg viewBox="0 0 10 10" className="h-[9px] w-[9px]">
                      <path d="M2 5.2 4.2 7.4 8 3" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="flex-1">
                  <span className="block text-sm text-ink" style={{ fontWeight: isCurrent ? 600 : 400 }}>
                    {stage.title}
                  </span>
                  <span className="block text-[11.5px] text-ink-faint">{stage.typicalTiming.label}</span>
                </span>
                {isCurrent ? (
                  <span
                    className="flex-none rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold text-white"
                    style={{ background: "#2953c4" }}
                  >
                    You are here
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {papers ? (
          <div className="mt-4.5 border-t pt-4.5" style={{ borderColor: "#eee9db" }}>
            <div
              className="flex items-center gap-3.5 rounded-xl border-[1.5px] border-dashed px-4 py-3"
              style={{ borderColor: "rgba(168,132,60,0.45)", background: "#faf7ef" }}
            >
              <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full" style={{ background: "#0a1626" }}>
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                  <path d="M7 8.5a3.5 3.5 0 0 0 0 7c2 0 3.3-1.7 5-4.5s3-4.5 5-4.5a3.5 3.5 0 0 1 0 7c-2 0-3.3-1.7-5-4.5" stroke="#f0d9a0" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">{papers.title}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  Ongoing — runs alongside everything else, not a step in this list
                </span>
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-4">
          <button onClick={onClose} className="text-[13px] text-ink-faint transition-colors hover:text-ink">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Papers card + milestone grid                                        */
/* ------------------------------------------------------------------ */

function PapersCard({ stage }: { stage: StageTemplate }) {
  return (
    <section
      className="mt-7 rounded-[18px] border-[1.5px] border-dashed px-7 py-6"
      style={{ borderColor: "rgba(168,132,60,0.5)", background: "#faf7ef" }}
    >
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full" style={{ background: "#0a1626" }}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]">
            <path d="M7 8.5a3.5 3.5 0 0 0 0 7c2 0 3.3-1.7 5-4.5s3-4.5 5-4.5a3.5 3.5 0 0 1 0 7c-2 0-3.3-1.7-5-4.5" stroke="#f0d9a0" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-display text-[19px] text-ink">{stage.title}</p>
            <span
              className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
              style={{ background: "#eee9db", color: "#8b7635" }}
            >
              Ongoing · not a gate
            </span>
          </div>
          <p className="mt-2 max-w-[600px] text-[13px] leading-relaxed text-ink-soft">
            {stage.description}
          </p>
        </div>
        <Link
          href={`/stages/${stage.id}`}
          className="flex flex-none items-center gap-2 self-center rounded-xl px-5 py-3 text-[13.5px] font-semibold transition-colors"
          style={{ background: "#16202e", color: "#f5f2ea" }}
        >
          Open {stage.title}
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
            <path d="M2.5 8h10.5M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

function MilestoneCard({
  stage,
  numeral,
  status,
  isCurrent,
  targetDate,
  onSetCurrent,
}: {
  stage: StageTemplate;
  numeral: string;
  status: StageStatus;
  isCurrent: boolean;
  targetDate: string | null;
  onSetCurrent: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col gap-2 rounded-2xl border-[1.5px] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(10,22,38,0.4)]"
      style={{
        borderColor: isCurrent ? "rgba(41,83,196,0.4)" : "#e5e0d2",
        background: isCurrent ? "#fffdf8" : "#fffdf8",
        opacity: status === "upcoming" ? 0.92 : 1,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="font-display text-[15px]" style={{ color: "#a8843c" }}>{numeral}</span>
        <span className="text-[11px] font-semibold" style={{ color: STATUS_COLOR[status] }}>
          {STATUS_LABEL[status]}
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "#b3bac2" }}>{stage.typicalTiming.label}</span>
      </div>
      {status !== "passed" && targetDate ? (
        <div className="-mt-0.5">
          <CountdownChip date={targetDate} />
        </div>
      ) : null}
      <Link href={`/stages/${stage.id}`} className="font-display text-[19px] leading-tight text-ink hover:text-oxford">
        {stage.title}
      </Link>
      <p className="text-[12.5px] leading-snug" style={{ color: "#8b93a3" }}>
        {stage.description.length > 96 ? `${stage.description.slice(0, 96)}…` : stage.description}
      </p>
      {isCurrent ? (
        <span className="mt-1 self-start text-[12.5px] font-semibold" style={{ color: "#a8843c" }}>
          ● You&apos;re working on this now
        </span>
      ) : (
        <button
          onClick={onSetCurrent}
          className="mt-1 flex items-center gap-1.5 self-start text-[12.5px] font-semibold transition-all hover:gap-2"
          style={{ color: "#2953c4" }}
        >
          Work on this now
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
            <path d="M2.5 8h10.5M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ProgrammeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [stageInfo, setStageInfo] = useState<StageInfo | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // First visit after the welcome wizard: run the coach-mark tour once the
  // dashboard has painted. Replayable from the footer.
  useEffect(() => {
    if (!data || !currentStageId) return;
    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(TOUR_DONE_KEY));
    } catch {
      // Storage unavailable → skip the tour rather than loop it forever.
    }
    if (seen) return;
    const t = setTimeout(() => setTourOpen(true), 700);
    return () => clearTimeout(t);
  }, [data, currentStageId]);

  useEffect(() => {
    Promise.all([
      apiGet<ProgrammeResponse>("/api/programme"),
      apiGet<AppSettings>("/api/settings").catch(() => null),
    ])
      .then(([programmeData, settings]) => {
        // Fresh install (never onboarded, no declared stage) → run the wizard.
        if (settings && !settings.onboarded && !settings.current_stage) {
          router.replace("/welcome");
          return;
        }
        setData(programmeData);
        setCurrentStageId(
          pickCurrentStageId(programmeData.programme, programmeData.instances, settings),
        );
      })
      .catch((e) => setError(messageOf(e)));
  }, [router]);

  useEffect(() => {
    if (!currentStageId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ documents }, { sessions }, { reports }, { findings }] = await Promise.all([
          apiGet<{ documents: DocumentSummary[] }>(`/api/documents?stageId=${currentStageId}`),
          apiGet<{ sessions: SessionRow[] }>(`/api/sessions?stageId=${currentStageId}`),
          apiGet<{ reports: ReportRow[] }>("/api/reports"),
          apiGet<{ findings: FindingRow[] }>(
            `/api/findings?stageId=${currentStageId}&unresolved=1`,
          ).catch(() => ({ findings: [] as FindingRow[] })),
        ]);
        if (cancelled) return;
        const sessionIds = new Set(sessions.map((s) => s.id));
        const docIds = new Set(documents.map((d) => d.id));
        setStageInfo({
          stageId: currentStageId,
          docs: documents,
          sessions,
          findings,
          reports: reports.filter(
            (r) =>
              (r.session_id && sessionIds.has(r.session_id)) ||
              (r.document_id && docIds.has(r.document_id)),
          ),
        });
      } catch {
        if (!cancelled) {
          setStageInfo({ stageId: currentStageId, docs: [], sessions: [], reports: [], findings: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStageId]);

  async function applyCurrentStage(stageId: string) {
    if (!data) return;
    try {
      const { instances } = await apiSend<{ instances: StageInstance[] }>(
        "/api/programme/current-stage",
        "POST",
        { stageId },
      );
      setData({ programme: data.programme, instances });
      setCurrentStageId(stageId);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  if (error) return <div className="mx-auto max-w-[880px] px-5 py-12"><ErrorBanner tone="red" message={error} /></div>;
  if (!data || !currentStageId) return <PageLoading label="Loading your programme…" />;

  const { programme, instances } = data;
  const byStage = new Map(instances.map((i) => [i.stage_id, i]));
  const gates = gateStages(programme);
  const papers = papersStage(programme);
  const currentStage = gates.find((s) => s.id === currentStageId) ?? gates[0];
  const currentNumeral = ROMAN[Math.max(0, gates.findIndex((s) => s.id === currentStageId))];
  const info = stageInfo?.stageId === currentStage.id ? stageInfo : null;

  return (
    <div className="mx-auto max-w-[1140px] px-5 py-12 md:px-9 md:py-13">
      <p
        className="anim-rise text-[11px] font-semibold uppercase tracking-[0.24em]"
        style={{ color: "#98a1ab" }}
      >
        {programme.name} · {currentStage.typicalTiming.label}
      </p>
      <h1
        className="anim-rise mt-2.5 max-w-[720px] font-display text-[40px] font-normal leading-[1.08] tracking-tight text-ink md:text-[44px]"
        style={{ "--d": "60ms" } as CSSProperties}
      >
        Your doctorate,{" "}
        <em className="italic font-normal" style={{ color: "#2953c4" }}>
          rehearsed
        </em>{" "}
        before it&apos;s real.
      </h1>

      <div className="anim-rise" style={{ "--d": "120ms" } as CSSProperties}>
        <MilestoneRail gates={gates} byStage={byStage} currentId={currentStage.id} onSetCurrent={applyCurrentStage} />
      </div>

      <div className="anim-rise" style={{ "--d": "200ms" } as CSSProperties}>
        <HeroCurrentStage
          stage={currentStage}
          instance={byStage.get(currentStage.id)}
          numeral={currentNumeral}
          info={info}
          onEditStages={() => setOnboardingOpen(true)}
        />
      </div>

      {papers ? (
        <div className="anim-rise" style={{ "--d": "280ms" } as CSSProperties}>
          <PapersCard stage={papers} />
        </div>
      ) : null}

      <div data-tour="journey">
        <p className="mt-11 text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: "#98a1ab" }}>
          The full journey
        </p>
        <p className="mt-1.5 text-[12.5px]" style={{ color: "#98a1ab" }}>
          Use “Work on this now” to switch your current stage — nothing here has to go in order.
        </p>
        <div className="mt-4 grid gap-3.5 md:grid-cols-3">
          {gates.map((stage, i) => (
            <div
              key={stage.id}
              className="anim-rise-sm"
              style={{ "--d": `${320 + i * 70}ms` } as CSSProperties}
            >
              <MilestoneCard
                stage={stage}
                numeral={ROMAN[i]}
                status={byStage.get(stage.id)?.status ?? "upcoming"}
                isCurrent={stage.id === currentStage.id}
                targetDate={byStage.get(stage.id)?.target_date ?? null}
                onSetCurrent={() => applyCurrentStage(stage.id)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        {programme.institutionNote ? (
          <p className="max-w-[720px] text-xs leading-relaxed" style={{ color: "#98a1ab" }}>
            {programme.institutionNote}
          </p>
        ) : null}
        <button
          onClick={() => setTourOpen(true)}
          className="ml-auto whitespace-nowrap text-xs text-ink-faint transition-colors hover:text-oxford"
        >
          Replay the tour
        </button>
      </div>

      {tourOpen ? <CoachTour steps={TOUR_STEPS} onClose={() => setTourOpen(false)} /> : null}

      {onboardingOpen ? (
        <OnboardingModal
          programme={programme}
          byStage={byStage}
          currentId={currentStage.id}
          onSetCurrent={(id) => applyCurrentStage(id)}
          onClose={() => setOnboardingOpen(false)}
        />
      ) : null}
    </div>
  );
}
