"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageRow, SessionRow } from "@/lib/db/repos/sessions";
import type { ReportRow } from "@/lib/db/repos/reports";
import { findStage, getSessionStyle } from "@/lib/template";
import { apiGet, apiSend, messageOf } from "@/components/api";
import { streamSessionEvents } from "@/components/use-sse-stream";
import { cancelSpeech, speakAloud, useSpeechRecognition } from "@/components/use-speech";
import { ErrorBanner, PageLoading, Spinner } from "@/components/ui";

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

// "Mock viva — Transfer of Status", "Rebuttal sparring — Papers & Rebuttals", …
function sessionTitle(stageId: string): string {
  const stage = findStage(stageId);
  if (!stage) return "Session";
  return `${getSessionStyle(stage).label} — ${stage.title}`;
}

// The assessor personas for the panel bench.
function panelFor(stageId: string): { id: string; name: string; role: string }[] {
  return findStage(stageId)?.assessment?.panel ?? [];
}

// Panel utterances open with "[Dr Chen]" / "[Prof Whitfield]". Pull the tag
// out for the speaker chip and strip it from the displayed text.
function splitSpeaker(content: string): { speaker: string | null; text: string } {
  const m = content.match(/^\s*\[([^\]\n]{1,40})\]:?\s*/);
  if (!m) return { speaker: null, text: content };
  return { speaker: m[1], text: content.slice(m[0].length) };
}

function PanelBubble({
  speaker,
  text,
  streaming,
}: {
  speaker: string | null;
  text: string;
  streaming?: boolean;
}) {
  return (
    <div className="max-w-[88%] self-start" style={{ animation: "riseSm 0.4s ease both" }}>
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#f0d9a0" }}>
        {speaker ?? "Panel"}
      </p>
      <div
        className="whitespace-pre-wrap rounded-2xl rounded-tl-sm px-5 py-4 font-display text-[16.5px] leading-relaxed"
        style={{ background: "#f5f2ea", color: "#16202e", boxShadow: "0 12px 30px -18px rgba(0,0,0,0.6)" }}
      >
        {text}
        {streaming ? (
          <span
            className="ml-0.5 inline-block h-4 w-0.5 align-[-2px]"
            style={{ background: "#2953c4", animation: "blink 0.9s step-end infinite" }}
          />
        ) : null}
      </div>
    </div>
  );
}

function CandidateBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[88%] self-end" style={{ animation: "riseSm 0.4s ease both" }}>
      <p className="mb-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(245,242,234,0.4)" }}>
        You
      </p>
      <div
        className="whitespace-pre-wrap rounded-2xl rounded-tr-sm px-[18px] py-3.5 text-sm leading-relaxed text-white"
        style={{ background: "#2953c4" }}
      >
        {text}
      </div>
    </div>
  );
}

// The panel bench chip for each assessor.
function BenchChip({ name, role }: { name: string; role: string }) {
  const initial = name.replace(/^(Dr|Prof|Professor)\.?\s+/i, "").charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(240,217,160,0.2)" }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full font-display text-[13px]"
        style={{ background: "linear-gradient(135deg,#17406b,#0a1626)", border: "1px solid rgba(240,217,160,0.4)", color: "#f0d9a0" }}
      >
        {initial}
      </div>
      <div>
        <p className="text-[12.5px] font-semibold" style={{ color: "#f5f2ea" }}>{name}</p>
        <p className="text-[10px]" style={{ color: "rgba(245,242,234,0.45)" }}>{role}</p>
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
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [input, setInput] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const readAloudRef = useRef(false);
  useEffect(() => {
    readAloudRef.current = readAloud;
  }, [readAloud]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const begunRef = useRef(false);

  // Voice answers: finalized speech segments append to the composer.
  const {
    supported: micSupported,
    listening,
    error: micError,
    start: startMic,
    stop: stopMic,
  } = useSpeechRecognition((finalText) => {
    setInput((prev) => (prev ? `${prev} ${finalText}` : finalText));
  });

  useEffect(() => () => cancelSpeech(), []);

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
            if (readAloudRef.current) speakAloud(event.content);
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
    if (listening) stopMic();
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

  async function draftLetter() {
    setDrafting(true);
    setError(null);
    try {
      const { reportId } = await apiSend<{ reportId: string }>(
        `/api/sessions/${sessionId}/rebuttal-letter`,
        "POST",
      );
      router.push(`/reports/${reportId}`);
    } catch (err) {
      setError({ message: messageOf(err) });
      setDrafting(false);
    }
  }

  if (!session && !error) return <PageLoading label="Entering the viva room…" />;
  if (!session) {
    return (
      <div className="mx-auto max-w-[880px] px-5 py-11">
        <ErrorBanner tone="red" message={error!.message} />
      </div>
    );
  }

  const live = liveText !== null ? splitSpeaker(liveText) : null;
  const existingReport = reports.find((r) => r.type === "viva_assessment");
  const rebuttalReport = reports.find((r) => r.type === "rebuttal_letter");
  const supportsRebuttal = Boolean(
    findStage(session?.stage_id ?? "")?.activities.includes("rebuttal_roleplay"),
  );
  const canSpeak = session.status === "active" && !concluded && !assessing;
  const panel = panelFor(session.stage_id);

  return (
    <div
      className="mx-auto flex max-w-[880px] flex-col px-5 pb-9 pt-7 md:px-9"
      style={{ height: "calc(100vh - 64px)", boxSizing: "border-box" }}
    >
      {/* Panel bench */}
      <div className="flex flex-wrap items-center gap-3.5 pb-5">
        <div className="flex flex-wrap gap-2.5">
          {panel.map((p) => (
            <BenchChip key={p.id} name={p.name} role={p.role} />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <button
            onClick={() => {
              setReadAloud((v) => {
                if (v) cancelSpeech();
                return !v;
              });
            }}
            title="Read the panel's questions aloud"
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              background: readAloud ? "rgba(240,217,160,0.14)" : "transparent",
              color: readAloud ? "#f0d9a0" : "rgba(245,242,234,0.7)",
            }}
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
              <path d="M2.5 6v4h2.8L9 13V3L5.3 6H2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Read aloud {readAloud ? "on" : "off"}
          </button>
          {supportsRebuttal && session.status === "ended" ? (
            rebuttalReport ? (
              <Link
                href={`/reports/${rebuttalReport.id}`}
                className="rounded-full px-4.5 py-2 text-[12.5px] font-medium"
                style={{ border: "1px solid rgba(240,217,160,0.35)", color: "#f0d9a0" }}
              >
                View rebuttal letter →
              </Link>
            ) : (
              <button
                onClick={draftLetter}
                disabled={drafting || entries.length === 0}
                className="flex items-center gap-2 rounded-full px-4.5 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-50"
                style={{ border: "1px solid rgba(240,217,160,0.35)", color: "#f0d9a0" }}
              >
                {drafting ? <Spinner className="h-3.5 w-3.5" /> : null}
                {drafting ? "Drafting your letter…" : "Draft rebuttal letter"}
              </button>
            )
          ) : null}
          {existingReport ? (
            <Link
              href={`/reports/${existingReport.id}`}
              className="rounded-full px-4.5 py-2 text-[12.5px] font-medium"
              style={{ border: "1px solid rgba(240,217,160,0.35)", color: "#f0d9a0" }}
            >
              View assessment →
            </Link>
          ) : (
            <button
              onClick={endAndAssess}
              disabled={assessing || streaming || entries.length === 0}
              className="flex items-center gap-2 rounded-full px-4.5 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-50"
              style={{ border: "1px solid rgba(240,217,160,0.35)", color: "#f0d9a0" }}
            >
              {assessing ? <Spinner className="h-3.5 w-3.5" /> : null}
              {assessing ? "The panel is deliberating…" : "End viva & get assessment"}
            </button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-[18px] p-7"
        style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}
      >
        <div className="mx-auto flex max-w-[640px] flex-col gap-5">
          <p className="text-center text-[11px] uppercase tracking-[0.18em]" style={{ color: "rgba(245,242,234,0.35)" }}>
            {sessionTitle(session.stage_id)} · the panel has read your report
          </p>
          {entries.length === 0 && streaming && !live ? (
            <div className="flex items-center gap-2 self-start text-sm" style={{ color: "rgba(245,242,234,0.5)" }}>
              <Spinner className="h-4 w-4" /> The panel is settling in…
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
            <PanelBubble speaker={live.speaker} text={live.text} streaming={streaming} />
          ) : null}
          {concluded ? (
            <div
              className="mx-auto mt-2 rounded-xl px-6 py-3.5 text-center"
              style={{ border: "1px solid rgba(240,217,160,0.3)" }}
            >
              <p className="font-display text-[16px] italic" style={{ color: "#f0d9a0" }}>
                The panel has concluded the viva.
              </p>
              {!existingReport ? (
                <p className="mt-1 text-xs" style={{ color: "rgba(245,242,234,0.5)" }}>
                  Request your assessment above.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error.message} hint={error.hint} />
        </div>
      ) : null}
      {micError ? (
        <div className="mt-3">
          <ErrorBanner message={micError} />
        </div>
      ) : null}

      {/* Composer */}
      <div className="mt-4">
        <div
          className="flex items-end gap-2.5 rounded-2xl py-1.5 pl-5 pr-1.5"
          style={{
            border: `1px solid ${listening ? "rgba(226,96,79,0.5)" : "rgba(255,255,255,0.12)"}`,
            background: "rgba(255,255,255,0.06)",
          }}
        >
          {listening ? (
            <div className="flex flex-1 items-center gap-3.5 py-[15px]">
              <span className="flex h-[22px] items-center gap-[3px]">
                {[0, 0.15, 0.3, 0.45, 0.6].map((d) => (
                  <span
                    key={d}
                    className="h-[22px] w-[3px] rounded"
                    style={{ background: "#e2604f", animation: `wave 0.9s ${d}s ease-in-out infinite` }}
                  />
                ))}
              </span>
              <span className="text-[13.5px]" style={{ color: "rgba(245,242,234,0.75)" }}>
                Listening — speak your answer. Pauses are fine; the mic stays open.
              </span>
            </div>
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              disabled={!canSpeak || streaming}
              placeholder={
                canSpeak
                  ? "Answer the panel — type, or press the mic and speak. (Enter to send)"
                  : "This viva has ended."
              }
              className="flex-1 resize-none border-none bg-transparent py-3.5 text-sm leading-relaxed outline-none disabled:opacity-60"
              style={{ color: "#f5f2ea" }}
            />
          )}
          <button
            onClick={listening ? stopMic : startMic}
            disabled={!canSpeak || streaming || !micSupported}
            title={
              micSupported
                ? listening
                  ? "Stop recording"
                  : "Record a voice answer"
                : "Voice input needs Chrome or Safari"
            }
            className="flex h-11 w-11 flex-none items-center justify-center rounded-xl transition-colors disabled:opacity-40"
            style={{
              border: `1px solid ${listening ? "#e2604f" : "rgba(255,255,255,0.15)"}`,
              background: listening ? "rgba(226,96,79,0.15)" : "transparent",
              color: listening ? "#e2604f" : "rgba(245,242,234,0.75)",
            }}
          >
            {listening ? (
              <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "#e2604f" }} />
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="h-[17px] w-[17px]" aria-hidden="true">
                <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            onClick={send}
            disabled={!canSpeak || streaming || input.trim() === ""}
            className="flex h-11 flex-none items-center gap-2 rounded-xl px-5.5 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-50"
            style={{ background: "#2953c4", boxShadow: "0 10px 24px -12px rgba(41,83,196,0.8)" }}
          >
            {streaming ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                Send
                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                  <path d="M2 8h11M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>
        <p className="mt-2 px-1 text-[11.5px]" style={{ color: "rgba(245,242,234,0.35)" }}>
          {listening
            ? "Press the mic to stop, review your answer, then Send."
            : "Your answers stay in this session. Enter to send · Shift+Enter for a new line."}
        </p>
      </div>
    </div>
  );
}
