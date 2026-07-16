"use client";

// Deadline countdown chip for gate target dates. Tone follows urgency:
// overdue red, inside six weeks brass, further out muted.
import { daysUntil, formatCountdown, urgencyOf, type Urgency } from "@/lib/dates";

const URGENCY_STYLE: Record<Urgency, { color: string; background: string; border: string }> = {
  overdue: { color: "#b3402f", background: "#fdeeec", border: "rgba(226,96,79,0.45)" },
  urgent: { color: "#8b6a24", background: "#f8f1de", border: "rgba(168,132,60,0.5)" },
  soon: { color: "#5b6673", background: "#f1f4fb", border: "#dfe5f0" },
  comfortable: { color: "#98a1ab", background: "transparent", border: "#e5e0d2" },
};

export function CountdownChip({
  date,
  className = "",
}: {
  date: string | null | undefined;
  className?: string;
}) {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === null) return null;
  const s = URGENCY_STYLE[urgencyOf(days)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ color: s.color, background: s.background, borderColor: s.border }}
      title={`Target date: ${date}`}
    >
      <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden="true">
        <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3.6V6l1.7 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {formatCountdown(days)}
    </span>
  );
}

/** True when a set target date is within the six-week urgency window (or past). */
export function isGateUrgent(date: string | null | undefined): boolean {
  if (!date) return false;
  const days = daysUntil(date);
  if (days === null) return false;
  const u = urgencyOf(days);
  return u === "urgent" || u === "overdue";
}
