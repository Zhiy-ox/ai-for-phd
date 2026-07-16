"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionRow } from "@/lib/db/repos/sessions";
import { findStage, getSessionStyle } from "@/lib/template";
import { apiGet, apiSend, formatDateTime, messageOf } from "@/components/api";
import { ProviderBadge, SessionStatusChip } from "@/components/status-chip";
import { Card, EmptyState, ErrorBanner, GuideSteps, PageLoading, SectionLabel } from "@/components/ui";
import type { CSSProperties } from "react";

function describeSession(s: SessionRow): string {
  if (s.type !== "viva") return "Document review";
  const stage = findStage(s.stage_id);
  if (!stage) return `Session — ${s.stage_id}`;
  let isDrill = false;
  try {
    isDrill = (JSON.parse(s.config_json) as { mode?: string }).mode === "drill";
  } catch {
    // Old sessions predate config parsing edge cases — treat as full sessions.
  }
  return `${isDrill ? "Quick-fire drill" : getSessionStyle(stage).label} — ${stage.title}`;
}

function SessionRowItem({
  session: s,
  onChanged,
  onError,
}: {
  session: SessionRow;
  onChanged: (next: SessionRow | null) => void;
  onError: (message: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const label = s.title || describeSession(s);

  async function saveTitle() {
    const title = draft.trim();
    setRenaming(false);
    if (title === (s.title ?? "")) return;
    setBusy(true);
    try {
      const { session } = await apiSend<{ session: SessionRow }>(
        `/api/sessions/${s.id}`,
        "PATCH",
        { title: title || null },
      );
      onChanged(session);
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiSend(`/api/sessions/${s.id}`, "DELETE");
      onChanged(null);
    } catch (e) {
      onError(messageOf(e));
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Card className="group flex flex-wrap items-center gap-3 p-4 transition-all hover:-translate-y-px hover:shadow-md">
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveTitle();
            if (e.key === "Escape") setRenaming(false);
          }}
          placeholder={describeSession(s)}
          className="min-w-[220px] flex-1 rounded-lg border border-oxford/40 bg-white px-2.5 py-1 text-sm font-medium text-ink focus:outline-none"
        />
      ) : (
        <Link href={`/sessions/${s.id}`} className="font-medium text-oxford hover:underline">
          {label}
        </Link>
      )}
      <ProviderBadge provider={s.provider} />
      <SessionStatusChip status={s.status} />
      <span className="ml-auto flex items-center gap-1">
        <span className="mr-2 text-xs text-ink-faint">{formatDateTime(s.created_at)}</span>
        {confirmingDelete ? (
          <span className="anim-rise-sm flex items-center gap-2 text-xs">
            <span className="text-ink-soft">Delete transcript &amp; reports?</span>
            <button
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg border border-red-200 px-2.5 py-1 font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="text-ink-faint transition-colors hover:text-ink"
            >
              Keep
            </button>
          </span>
        ) : (
          <>
            <button
              onClick={() => {
                setDraft(s.title ?? "");
                setRenaming(true);
              }}
              disabled={busy || renaming}
              title="Rename session"
              className="rounded-lg p-1.5 text-ink-faint opacity-0 transition-all hover:bg-oxford-faint hover:text-oxford focus:opacity-100 group-hover:opacity-100"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M11.5 2.5 13.5 4.5 5 13H3v-2l8.5-8.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              title="Delete session"
              className="rounded-lg p-1.5 text-ink-faint opacity-0 transition-all hover:bg-red-50 hover:text-red-700 focus:opacity-100 group-hover:opacity-100"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v4.5M9.5 6.5v4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </span>
    </Card>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ sessions: SessionRow[] }>("/api/sessions")
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(messageOf(e)));
  }, []);

  if (error && sessions === null) return <ErrorBanner tone="red" message={error} />;
  if (sessions === null) return <PageLoading label="Loading sessions…" />;

  return (
    <div className="mx-auto max-w-[880px] px-5 py-12 md:px-9">
      <header className="anim-rise mb-8">
        <SectionLabel>History</SectionLabel>
        <h1 className="mt-2 font-display text-[34px] font-normal text-ink">Sessions</h1>
      </header>

      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          hint="Transcripts and assessments collect here once you face a panel:"
        >
          <GuideSteps
            steps={[
              "Open your current stage from the Journey page.",
              "Upload the document under examination and get feedback on it.",
              "Pick an examiner style and begin — every session is kept here, with its transcript and verdict.",
            ]}
          />
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s, i) => (
            <li key={s.id} className="anim-rise-sm" style={{ "--d": `${i * 50}ms` } as CSSProperties}>
              <SessionRowItem
                session={s}
                onError={setError}
                onChanged={(next) =>
                  setSessions((prev) =>
                    prev === null
                      ? prev
                      : next === null
                        ? prev.filter((x) => x.id !== s.id)
                        : prev.map((x) => (x.id === s.id ? next : x)),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
