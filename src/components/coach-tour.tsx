"use client";

// First-run coach marks: a spotlight that walks new users through the
// dashboard loop (rail → next move → readiness → journey grid). Targets are
// elements carrying data-tour="<step id>"; steps whose target is absent are
// skipped, so the tour degrades gracefully on sparse dashboards.
import { useCallback, useEffect, useRef, useState } from "react";

export interface TourStep {
  id: string;
  title: string;
  body: string;
}

export const TOUR_DONE_KEY = "aiphd-tour-done";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function targetOf(step: TourStep): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
}

export function CoachTour({
  steps: wanted,
  onClose,
}: {
  steps: TourStep[];
  onClose: () => void;
}) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const rafRef = useRef(0);

  // Resolve which steps actually have a target on this dashboard. Deferred to
  // a frame so the page beneath has committed its layout first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSteps(wanted.filter((s) => targetOf(s)));
    });
    return () => cancelAnimationFrame(raf);
  }, [wanted]);

  const step = steps?.[idx] ?? null;

  const measure = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!step) return;
      const el = targetOf(step);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    });
  }, [step]);

  useEffect(() => {
    if (!step) return;
    // Center the target with an explicitly clamped scroll — scrollIntoView can
    // overshoot past the document edges and strand the spotlight; the 500ms
    // cutout glide supplies the motion instead of smooth scrolling.
    const el = targetOf(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const wanted = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.max(0, Math.min(max, wanted)), behavior: "auto" });
    }
    measure();
    // Belt-and-braces re-measure after layout/scroll anchoring settles.
    const settle = setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, "1");
    } catch {
      // Private-mode storage failures just mean the tour reappears next visit.
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        setIdx((i) => (steps && i < steps.length - 1 ? i + 1 : i));
      }
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, finish]);

  if (!steps || steps.length === 0 || !step || !box) return null;

  const last = idx === steps.length - 1;
  // Tooltip below the spotlight when there's room, otherwise above.
  const below = box.top + box.height + 210 < window.innerHeight;
  const cardTop = below ? box.top + box.height + 14 : undefined;
  const cardBottom = below ? undefined : window.innerHeight - box.top + 14;
  const cardLeft = Math.max(16, Math.min(box.left, window.innerWidth - 396));

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      {/* Spotlight: the shadow does the dimming, so the hole stays crisp and
          the whole cutout glides between steps. */}
      <div
        className="absolute rounded-2xl transition-all duration-500"
        style={{
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          boxShadow: "0 0 0 9999px rgba(10,22,38,0.62)",
          border: "1.5px solid rgba(240,217,160,0.9)",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <div
        key={step.id}
        className="anim-pop pointer-events-auto absolute w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border p-5"
        style={{
          top: cardTop,
          bottom: cardBottom,
          left: cardLeft,
          background: "#fffdf8",
          borderColor: "#e5e0d2",
          boxShadow: "0 30px 70px -30px rgba(10,22,38,0.6)",
        }}
      >
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#a8843c" }}>
          Quick tour · {idx + 1} of {steps.length}
        </p>
        <p className="mt-1.5 font-display text-[19px] leading-snug text-ink">{step.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === idx ? 18 : 6, background: i <= idx ? "#2953c4" : "#e5e0d2" }}
              />
            ))}
          </span>
          <button
            onClick={finish}
            className="ml-auto text-[12.5px] text-ink-faint transition-colors hover:text-ink"
          >
            Skip
          </button>
          {idx > 0 ? (
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-oxford/40 hover:text-oxford"
            >
              Back
            </button>
          ) : null}
          <button
            onClick={() => (last ? finish() : setIdx((i) => i + 1))}
            className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-all active:scale-[0.96]"
            style={{ background: "#2953c4", boxShadow: "0 8px 18px -8px rgba(41,83,196,0.7)" }}
          >
            {last ? "Start working" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
