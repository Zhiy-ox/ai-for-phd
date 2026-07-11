"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionRow } from "@/lib/db/repos/sessions";
import { findStage, getSessionStyle } from "@/lib/template";
import { apiGet, formatDateTime, messageOf } from "@/components/api";
import { ProviderBadge, SessionStatusChip } from "@/components/status-chip";
import { Card, EmptyState, ErrorBanner, PageLoading, SectionLabel } from "@/components/ui";

function describeSession(s: SessionRow): string {
  if (s.type !== "viva") return "Document review";
  const stage = findStage(s.stage_id);
  if (!stage) return `Session — ${s.stage_id}`;
  return `${getSessionStyle(stage).label} — ${stage.title}`;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ sessions: SessionRow[] }>("/api/sessions")
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(messageOf(e)));
  }, []);

  if (error) return <ErrorBanner tone="red" message={error} />;
  if (sessions === null) return <PageLoading label="Loading sessions…" />;

  return (
    <div className="mx-auto max-w-[880px] px-5 py-12 md:px-9">
      <header className="mb-8">
        <SectionLabel>History</SectionLabel>
        <h1 className="mt-2 font-display text-[34px] font-normal text-ink">Sessions</h1>
      </header>

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          hint="Start a mock viva from the Transfer of Status stage — the transcript and assessment will be kept here."
        />
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/sessions/${s.id}`} className="block">
                <Card className="flex flex-wrap items-center gap-3 p-4 transition-shadow hover:shadow-md">
                  <span className="font-medium text-oxford">{describeSession(s)}</span>
                  <ProviderBadge provider={s.provider} />
                  <SessionStatusChip status={s.status} />
                  <span className="ml-auto text-xs text-ink-faint">
                    {formatDateTime(s.created_at)}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
