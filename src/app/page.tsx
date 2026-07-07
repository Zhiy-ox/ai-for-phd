"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProgrammeTemplate, StageTemplate } from "@/lib/template";
import type { StageInstance } from "@/lib/db/repos/stage-instances";
import { ACTIVITY_LABELS, apiGet, formatDate, messageOf } from "@/components/api";
import { StageStatusChip } from "@/components/status-chip";
import { Chip, ErrorBanner, PageLoading, SectionLabel } from "@/components/ui";

interface ProgrammeResponse {
  programme: ProgrammeTemplate;
  instances: StageInstance[];
}

function StageCard({
  stage,
  instance,
  isLast,
}: {
  stage: StageTemplate;
  instance?: StageInstance;
  isLast: boolean;
}) {
  const status = instance?.status ?? "upcoming";
  return (
    <li className="relative pl-10">
      {/* timeline spine */}
      {!isLast ? (
        <span
          aria-hidden
          className="absolute left-[13px] top-8 h-[calc(100%+1rem)] w-px bg-line"
        />
      ) : null}
      <span
        aria-hidden
        className={`absolute left-1.5 top-6 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
          status === "passed"
            ? "border-emerald-500 bg-emerald-500"
            : status === "active"
              ? "border-oxford bg-white"
              : "border-line bg-paper"
        }`}
      >
        {status === "active" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-oxford" />
        ) : null}
      </span>
      <Link href={`/stages/${stage.id}`} className="block">
        <div
          className={`rounded-xl border bg-white p-5 transition-shadow ${
            stage.implemented
              ? "border-oxford/25 shadow-sm hover:shadow-md"
              : "border-line opacity-90 hover:opacity-100"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`font-display text-lg ${
                stage.implemented ? "text-oxford" : "text-ink-soft"
              }`}
            >
              {stage.title}
            </h3>
            <StageStatusChip status={status} />
            {stage.gate.formRef ? <Chip tone="brass">{stage.gate.formRef}</Chip> : null}
            {!stage.implemented ? <Chip tone="muted">Preview</Chip> : null}
            <span className="ml-auto text-xs text-ink-faint">
              {stage.typicalTiming.label}
              {instance?.target_date ? ` · target ${formatDate(instance.target_date)}` : ""}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{stage.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {stage.activities.map((a) => (
              <Chip key={a} tone={stage.implemented ? "navy" : "muted"}>
                {ACTIVITY_LABELS[a]}
                {!stage.implemented ? " · soon" : ""}
              </Chip>
            ))}
          </div>
          {stage.implemented ? (
            <p className="mt-4 text-sm font-medium text-oxford">Enter stage →</p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<ProgrammeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ProgrammeResponse>("/api/programme")
      .then(setData)
      .catch((e) => setError(messageOf(e)));
  }, []);

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (!data) return <PageLoading label="Loading your programme…" />;

  const { programme, instances } = data;
  const byStage = new Map(instances.map((i) => [i.stage_id, i]));
  const stages = [...programme.stages].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div>
      <header className="mb-10">
        <SectionLabel>{programme.name}</SectionLabel>
        <h1 className="mt-2 font-display text-3xl leading-tight text-oxford md:text-4xl">
          Your doctorate, rehearsed
          <br className="hidden md:block" /> before it&apos;s real.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every formal gate of the DPhil, laid out as a journey. Upload your
          documents, get rubric-based feedback, and face an AI assessor panel
          before you face the real one.
        </p>
      </header>

      <ol className="space-y-4">
        {stages.map((stage, i) => (
          <StageCard
            key={stage.id}
            stage={stage}
            instance={byStage.get(stage.id)}
            isLast={i === stages.length - 1}
          />
        ))}
      </ol>

      {programme.institutionNote ? (
        <p className="mt-10 max-w-2xl text-xs leading-relaxed text-ink-faint">
          {programme.institutionNote}
        </p>
      ) : null}
    </div>
  );
}
