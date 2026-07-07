"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageRow, SessionRow } from "@/lib/db/repos/sessions";
import type { ReportRow } from "@/lib/db/repos/reports";
import { apiGet, apiSend, messageOf } from "@/components/api";
import { ProviderBadge, SessionStatusChip } from "@/components/status-chip";
import { streamSessionEvents } from "@/components/use-sse-stream";
import { Button, ErrorBanner, PageLoading, Spinner } from "@/components/ui";

interface SessionResponse {
  session: SessionRow;
  messages: MessageRow[];
  reports: ReportRow[];
}

interface ChatEntry {
  id: string;
  role: "user" | "panel";
  speaker: string | null;
  content: string;
}

// Panel utterances open with "[Dr Chen]" / "[Prof Whitfield]". Pull the tag
// out for the speaker chip and strip it from the displayed text.
function splitSpeaker(content: string): { speaker: string | null; text: string } {
  const m = content.match(/^\s*\[([^\]\n]{1,40})\]:?\s*/);
  if (!m) return { speaker: null, text: content };
  return { speaker: m[1], text: content.slice(m[0].length) };
}

function PanelBubble({ speaker, text }: { speaker: string | null; text: string }) {
  return (
    <div className="max-w-[85%] self-start">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-oxford/70">
        {speaker ?? "Panel"}
      </p>
      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-3 text-sm leading-relaxed text-ink shadow-sm">
        {text}
      </div>
    </div>
  );
}

function CandidateBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[85%] self-end">
      <p className="mb-1 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        You
      </p>
      <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-oxford px-4 py-3 text-sm leading-relaxed text-white">
        {text}
      </div>
    </div>
  );
}

export default function VivaRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [session, setSession] = useState<SessionRow | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [liveText, setLiveText] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [concluded, setConcluded] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const begunRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  const runTurn = useCallback(
    async (text: string) => {
      setStreaming(true);
      setError(null);
      setLiveText("");
      let sawError = false;
      await streamSessionEvents(`/api/sessions/${sessionId}/turns`, { text }, (event) => {
        switch (event.type) {
          case "panel_delta":
            setLiveText((prev) => (prev ?? "") + event.text);
            scrollToBottom();
            break;
          case "panel_turn_complete": {
            const { speaker, text: clean } = splitSpeaker(event.content);
            setEntries((prev) => [
              ...prev,
              { id: event.messageId, role: "panel", speaker, content: clean },
            ]);
            setLiveText(null);
            scrollToBottom();
            break;
          }
          case "viva_concluded":
            setConcluded(true);
            setSession((s) => (s ? { ...s, status: "ended" } : s));
            break;
          case "error":
            sawError = true;
            setError({
              message: event.message,
              hint:
                event.code === "not_logged_in"
                  ? "Log in via Terminal, then send your answer again — nothing is lost."
                  : event.code === "usage_limit"
                    ? "Your subscription hit its usage window. Wait for the reset (or switch provider in a new session) and resend."
                    : undefined,
            });
            break;
        }
      });
      if (sawError) setLiveText(null);
      setStreaming(false);
    },
    [sessionId, scrollToBottom],
  );

  useEffect(() => {
    apiGet<SessionResponse>(`/api/sessions/${sessionId}`)
      .then((r) => {
        setSession(r.session);
        setReports(r.reports);
        setEntries(
          r.messages.map((m) => {
            if (m.role === "panel") {
              const { speaker, text } = splitSpeaker(m.content);
              return { id: m.id, role: "panel", speaker: m.speaker ?? speaker, content: text };
            }
            return { id: m.id, role: "user", speaker: null, content: m.content };
          }),
        );
        if (r.session.status === "ended") setConcluded(true);
        // Fresh active session: elicit the panel's opening.
        if (r.session.status === "active" && r.messages.length === 0 && !begunRef.current) {
          begunRef.current = true;
          void runTurn("");
        }
        scrollToBottom();
      })
      .catch((e) => setError({ message: messageOf(e) }));
  }, [sessionId, runTurn, scrollToBottom]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setEntries((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", speaker: null, content: text },
    ]);
    scrollToBottom();
    await runTurn(text);
  }

  async function endAndAssess() {
    setAssessing(true);
    setError(null);
    try {
      const { reportId } = await apiSend<{ reportId: string }>(
        `/api/sessions/${sessionId}/end`,
        "POST",
      );
      router.push(`/reports/${reportId}`);
    } catch (err) {
      setError({ message: messageOf(err) });
      setAssessing(false);
    }
  }

  if (!session && !error) return <PageLoading label="Entering the viva room…" />;
  if (!session) return <ErrorBanner tone="red" message={error!.message} />;

  const live = liveText !== null ? splitSpeaker(liveText) : null;
  const existingReport = reports.find((r) => r.type === "viva_assessment");
  const canSpeak = session.status === "active" && !concluded && !assessing;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col md:h-[calc(100vh-8rem)]">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/sessions" className="text-sm text-ink-faint hover:text-oxford">
          ← Sessions
        </Link>
        <h1 className="font-display text-xl text-oxford">Mock transfer viva</h1>
        <ProviderBadge provider={session.provider} />
        <SessionStatusChip status={session.status} />
        <span className="ml-auto flex items-center gap-2">
          {existingReport ? (
            <Link
              href={`/reports/${existingReport.id}`}
              className="text-sm font-medium text-oxford hover:underline"
            >
              View assessment →
            </Link>
          ) : (
            <Button
              variant="secondary"
              onClick={endAndAssess}
              disabled={assessing || streaming || entries.length === 0}
            >
              {assessing ? <Spinner /> : null}
              {assessing ? "The panel is deliberating…" : "End viva & get assessment"}
            </Button>
          )}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-line bg-oxford-faint/60 p-4 md:p-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {entries.length === 0 && streaming && !live ? (
            <div className="flex items-center gap-2 self-start text-sm text-ink-faint">
              <Spinner className="h-4 w-4 text-oxford" /> The panel is settling in…
            </div>
          ) : null}
          {entries.map((e) =>
            e.role === "panel" ? (
              <PanelBubble key={e.id} speaker={e.speaker} text={e.content} />
            ) : (
              <CandidateBubble key={e.id} text={e.content} />
            ),
          )}
          {live !== null ? (
            <PanelBubble
              speaker={live.speaker}
              text={live.text + (streaming ? " ▍" : "")}
            />
          ) : null}
          {concluded ? (
            <div className="my-2 rounded-lg border border-oxford/20 bg-white px-4 py-3 text-center text-sm text-oxford">
              The panel has concluded the viva.
              {!existingReport ? " Request your assessment above." : ""}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error.message} hint={error.hint} />
        </div>
      ) : null}

      <div className="mt-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            disabled={!canSpeak || streaming}
            placeholder={
              canSpeak
                ? "Answer the panel… (Enter to send, Shift+Enter for a new line)"
                : "This viva has ended."
            }
            className="flex-1 resize-none rounded-xl border border-line bg-white px-4 py-3 text-sm leading-relaxed text-ink focus:border-oxford focus:outline-none disabled:opacity-60"
          />
          <Button onClick={send} disabled={!canSpeak || streaming || input.trim() === ""}>
            {streaming ? <Spinner /> : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
