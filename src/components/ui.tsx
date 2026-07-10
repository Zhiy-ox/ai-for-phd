import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

export type ChipTone =
  | "green"
  | "amber"
  | "red"
  | "navy"
  | "brass"
  | "neutral"
  | "muted";

const CHIP_TONES: Record<ChipTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-700",
  navy: "border-oxford/15 bg-oxford-soft text-oxford",
  brass: "border-brass/25 bg-brass-soft text-brass",
  neutral: "border-line bg-white text-ink-soft",
  muted: "border-dashed border-line bg-transparent text-ink-faint",
};

export function Chip({
  tone = "neutral",
  children,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

const BUTTON_VARIANTS = {
  primary:
    "bg-oxford text-white shadow-[0_10px_24px_-12px_rgba(41,83,196,0.7)] hover:bg-oxford-mid hover:-translate-y-px",
  secondary:
    "border border-line bg-card text-ink hover:border-oxford/40 hover:text-oxford",
  ghost: "text-ink-soft hover:bg-oxford-faint hover:text-oxford",
  danger: "border border-red-200 bg-card text-red-700 hover:bg-red-50",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Spinner                                                             */
/* ------------------------------------------------------------------ */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-ink-faint">
      <Spinner className="h-6 w-6 text-oxford" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Banners & empty states                                              */
/* ------------------------------------------------------------------ */

export function ErrorBanner({
  message,
  hint,
  tone = "amber",
}: {
  message: string;
  hint?: string;
  tone?: "amber" | "red";
}) {
  const classes =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-red-300 bg-red-50 text-red-900";
  return (
    <div role="alert" className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>
      <p className="font-medium">{message}</p>
      {hint ? <p className="mt-1 opacity-80">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-display text-base text-ink-soft">{title}</p>
      {hint ? <p className="max-w-md text-sm text-ink-faint">{hint}</p> : null}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small typographic helpers                                           */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
      {children}
    </p>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-card ${className}`}>
      {children}
    </div>
  );
}
