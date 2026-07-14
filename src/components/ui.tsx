import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

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
    "border border-line bg-card text-ink hover:border-oxford/40 hover:text-oxford hover:-translate-y-px",
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 ${BUTTON_VARIANTS[variant]} ${className}`}
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
    <div className="anim-fade flex flex-col items-center justify-center gap-3 py-32 text-ink-faint">
      <Spinner className="h-6 w-6 text-oxford" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Motion primitives                                                    */
/* ------------------------------------------------------------------ */

// Three bouncing dots — "the panel is thinking". Inherits currentColor.
export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[3px] ${className}`} aria-label="Thinking…">
      {[0, 0.18, 0.36].map((d) => (
        <span
          key={d}
          className="h-[5px] w-[5px] rounded-full bg-current"
          style={{ animation: `typingDot 1.1s ${d}s ease-in-out infinite` }}
        />
      ))}
    </span>
  );
}

// A one-shot celebration burst. Render inside a `relative` container when
// something good happens; it flies 12 particles outward and fades. Purely
// decorative — reduced-motion users see nothing (global media query zeroes it).
const BURST_COLORS = ["#f0d9a0", "#2953c4", "#2eb87a", "#a8843c"];

export function Burst({ colors = BURST_COLORS }: { colors?: string[] }) {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    angle: i * 30,
    dist: 34 + (i % 3) * 14,
    color: colors[i % colors.length],
    delay: (i % 4) * 0.04,
  }));
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.angle}
          className="burst-p"
          style={
            {
              "--a": `${p.angle}deg`,
              "--dist": `${p.dist}px`,
              "--c": p.color,
              "--d": `${p.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

// Circle-and-tick that pops in and draws itself when `done` flips true.
export function AnimatedCheck({
  done,
  size = 18,
  doneColor = "#2eb87a",
  pendingColor = "#d8d2c2",
}: {
  done: boolean;
  size?: number;
  doneColor?: string;
  pendingColor?: string;
}) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full border-[1.5px] box-border transition-colors duration-300 ${done ? "anim-pop" : ""}`}
      style={{
        height: size,
        width: size,
        borderColor: done ? doneColor : pendingColor,
        background: done ? doneColor : "transparent",
      }}
    >
      {done ? (
        <svg viewBox="0 0 10 10" style={{ height: size / 2, width: size / 2 }}>
          <path
            d="M2 5.2 4.2 7.4 8 3"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="12"
            style={{ animation: "drawCheck 0.4s 0.15s ease both" }}
          />
        </svg>
      ) : null}
    </span>
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
    <div className="anim-rise-sm flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-display text-base text-ink-soft">{title}</p>
      {hint ? <p className="max-w-md text-sm text-ink-faint">{hint}</p> : null}
      {children}
    </div>
  );
}

// Numbered walkthrough for empty states: shows a new user the path forward
// instead of a dead end.
export function GuideSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="mx-auto mt-3 flex max-w-md flex-col gap-2.5 text-left">
      {steps.map((s, i) => (
        <li
          key={i}
          className="anim-rise-sm flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft"
          style={{ "--d": `${120 + i * 90}ms` } as CSSProperties}
        >
          <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-oxford-soft text-[11px] font-semibold text-oxford">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
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
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-card ${className}`} style={style}>
      {children}
    </div>
  );
}
