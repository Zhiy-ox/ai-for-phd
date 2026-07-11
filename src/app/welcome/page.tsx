"use client";

// First-run wizard: check the AI backends, pick a programme preset, declare
// where you are. Everything is changeable later in Settings.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listProgrammes, type ProgrammeTemplate, type StageTemplate } from "@/lib/template";
import type { StageInstance } from "@/lib/db/repos/stage-instances";
import type { AuthStatus } from "@/lib/providers/types";
import { apiGet, apiSend, messageOf, PROVIDER_LABELS } from "@/components/api";
import { AuthDot } from "@/components/provider-picker";
import { Button, Spinner } from "@/components/ui";

type Step = "backends" | "programme" | "stage";

function gatesOf(p: ProgrammeTemplate): StageTemplate[] {
  return [...p.stages]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((s) => s.gate.type !== "recurring");
}

export default function WelcomePage() {
  const router = useRouter();
  const programmes = listProgrammes();
  const [step, setStep] = useState<Step>("backends");
  const [status, setStatus] = useState<{ claude: AuthStatus; codex: AuthStatus } | null>(null);
  const [programmeId, setProgrammeId] = useState(programmes[0]?.id ?? "");
  const [stageId, setStageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ claude: AuthStatus; codex: AuthStatus }>("/api/providers/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const programme = programmes.find((p) => p.id === programmeId) ?? programmes[0];
  const anyBackend = Boolean(status?.claude.ok || status?.codex.ok);

  async function finish(skip = false) {
    setSaving(true);
    setError(null);
    try {
      if (!skip) {
        await apiSend("/api/settings", "PUT", { programme_id: programmeId });
        if (stageId) {
          await apiSend<{ instances: StageInstance[] }>(
            "/api/programme/current-stage",
            "POST",
            { stageId },
          );
        }
      }
      await apiSend("/api/settings", "PUT", { onboarded: "1" });
      router.replace("/");
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  }

  const steps: Step[] = ["backends", "programme", "stage"];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="mx-auto max-w-[640px] px-5 py-14 md:px-9">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
        Welcome · set up once, change anytime
      </p>
      <h1 className="mt-2.5 font-display text-[34px] font-normal leading-tight text-ink">
        Let&apos;s set up your doctorate.
      </h1>

      {/* Step dots */}
      <div className="mt-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <span
            key={s}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === stepIdx ? 28 : 10,
              background: i <= stepIdx ? "#2953c4" : "#e5e0d2",
            }}
          />
        ))}
      </div>

      {step === "backends" ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-ink">Your AI backends</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            AI for PhD uses no API keys. The assessor panels run on subscriptions you
            already have, through their locally installed CLIs — your documents never
            leave this machine.
          </p>
          <div className="mt-5 space-y-2.5">
            {(["claude", "codex"] as const).map((id) => {
              const auth = status?.[id] ?? null;
              return (
                <div
                  key={id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3.5"
                >
                  <span className="mt-1">
                    <AuthDot ok={auth ? auth.ok : null} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{PROVIDER_LABELS[id]}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
                      {auth === null ? "Checking…" : auth.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {status && !anyBackend ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-amber-800">
              No backend is ready yet. You can finish setup and explore the app, but
              feedback and mock vivas need at least one CLI logged in.
            </p>
          ) : null}
          <div className="mt-7 flex items-center justify-between">
            <button
              onClick={() => finish(true)}
              className="text-[13px] text-ink-faint hover:text-ink"
            >
              Skip setup
            </button>
            <Button onClick={() => setStep("programme")}>Continue</Button>
          </div>
        </section>
      ) : null}

      {step === "programme" ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-ink">Your programme</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            This sets the stages, gate names, and examiner panels. Pick the closest —
            every stage&apos;s dates and statuses stay editable.
          </p>
          <div className="mt-5 space-y-2.5">
            {programmes.map((p) => {
              const selected = p.id === programmeId;
              const gates = gatesOf(p);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setProgrammeId(p.id);
                    setStageId(null);
                  }}
                  className="w-full rounded-xl border-[1.5px] px-4 py-3.5 text-left transition-colors"
                  style={{
                    borderColor: selected ? "#2953c4" : "#e5e0d2",
                    background: selected ? "#e8eef9" : "#fffdf8",
                  }}
                >
                  <p className="text-sm font-semibold text-ink">{p.name}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-soft">
                    {gates.map((g) => g.title).join(" → ")}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-7 flex items-center justify-between">
            <button
              onClick={() => setStep("backends")}
              className="text-[13px] text-ink-faint hover:text-ink"
            >
              ← Back
            </button>
            <Button onClick={() => setStep("stage")}>Continue</Button>
          </div>
        </section>
      ) : null}

      {step === "stage" && programme ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-ink">Where are you now?</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Earlier stages are marked complete, later ones upcoming. Nothing has to
            happen in order — change this any time from the dashboard.
          </p>
          <div className="mt-5 space-y-2">
            {gatesOf(programme).map((s) => {
              const selected = s.id === stageId;
              return (
                <button
                  key={s.id}
                  onClick={() => setStageId(s.id)}
                  className="flex w-full items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors"
                  style={{
                    borderColor: selected ? "#2953c4" : "#e5e0d2",
                    background: selected ? "#e8eef9" : "#fffdf8",
                  }}
                >
                  <span className="flex-1">
                    <span className="block text-sm text-ink" style={{ fontWeight: selected ? 600 : 400 }}>
                      {s.title}
                    </span>
                    <span className="block text-[11.5px] text-ink-faint">
                      {s.typicalTiming.label}
                    </span>
                  </span>
                  {selected ? (
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
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          <div className="mt-7 flex items-center justify-between">
            <button
              onClick={() => setStep("programme")}
              className="text-[13px] text-ink-faint hover:text-ink"
            >
              ← Back
            </button>
            <Button onClick={() => finish(false)} disabled={saving || !stageId}>
              {saving ? <Spinner /> : null} Enter the journey
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
