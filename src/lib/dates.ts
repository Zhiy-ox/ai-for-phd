// Deadline math for gate target dates ("YYYY-MM-DD" from <input type=date>).
// Pure functions — see tests/dates.test.ts.

/** Whole days from `from`'s calendar date to the target date; null if unparseable. */
export function daysUntil(dateStr: string, from: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // new Date() rolls out-of-range parts over (month 13 → next January), so
  // round-trip the components to reject impossible dates.
  if (
    Number.isNaN(target.getTime()) ||
    target.getMonth() !== Number(m[2]) - 1 ||
    target.getDate() !== Number(m[3])
  ) {
    return null;
  }
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export type Urgency = "overdue" | "urgent" | "soon" | "comfortable";

/** Inside six weeks a gate counts as urgent (the M1 nudge threshold). */
export function urgencyOf(days: number): Urgency {
  if (days < 0) return "overdue";
  if (days <= 42) return "urgent";
  if (days <= 91) return "soon";
  return "comfortable";
}

export function formatCountdown(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) {
    const d = -days;
    return d === 1 ? "1 day overdue" : `${d} days overdue`;
  }
  if (days < 15) return `${days} days left`;
  if (days < 85) return `${Math.round(days / 7)} weeks left`;
  return `${Math.round(days / 30.4)} months left`;
}
