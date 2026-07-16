// Mock-viva session engine: session lifecycle + one streamed turn at a time.
// Implements the contracts documented in ./types.ts.
import { getProgramme, getStage } from "@/lib/template";
import { getActiveProgrammeId } from "@/lib/programme";
import type { ChatMessage, ProviderId, TurnRequest } from "@/lib/providers/types";
import { getProvider, resolveProviderAndModel } from "@/lib/providers/registry";
import {
  appendMessage,
  createSession,
  endSession,
  getSession,
  listMessages,
  setProviderSessionRef,
  type SessionRow,
} from "@/lib/db/repos/sessions";
import { getDocument } from "@/lib/db/repos/documents";
import { listFindings } from "@/lib/db/repos/findings";
import type { ReportRow } from "@/lib/db/repos/reports";
import { clearUsageLimit, recordUsageLimit } from "@/lib/providers/usage";
import { buildPanelSystemPrompt, parseSpeakerTag, stripVivaCompleteToken } from "./prompts";
import { generateQuestionPlan } from "./planner";
import { generateAssessment } from "./report";
import type { PanelStyle, SessionEvent, VivaConfig } from "./types";

const BEGIN_MESSAGE =
  "(The candidate has entered the room. Introduce the panel briefly and ask your first question.)";

function loadVivaDocuments(documentIds: string[]): { title: string; text: string }[] {
  return documentIds.map((id) => {
    const doc = getDocument(id);
    if (!doc) throw new Error(`Document not found: ${id}`);
    if (!doc.extracted_text) {
      throw new Error(
        `Document "${doc.filename}" has no extracted text — re-upload a supported file or paste its text before the viva.`,
      );
    }
    return { title: doc.filename, text: doc.extracted_text };
  });
}

export async function startVivaSession(opts: {
  stageId: string;
  provider?: ProviderId;
  documentIds: string[];
  model?: string;
  style?: PanelStyle;
  mode?: "viva" | "drill";
}): Promise<SessionRow> {
  const mode = opts.mode ?? "viva";
  if (opts.documentIds.length === 0 && mode !== "drill") {
    throw new Error("A mock viva needs at least one document.");
  }
  const programmeId = getActiveProgrammeId();
  const stage = getStage(programmeId, opts.stageId);
  if (!stage.assessment) {
    throw new Error(`Stage "${stage.id}" does not define a viva panel.`);
  }
  const { provider, model } = resolveProviderAndModel(opts);
  const documents = loadVivaDocuments(opts.documentIds);
  // Drills skip the planner: they are cheap, fast, and steered by the
  // weakness ledger instead of a prepared question map.
  const questionPlan =
    mode === "drill" || documents.length === 0
      ? undefined
      : await generateQuestionPlan(provider, model, stage, documents[0].text, opts.style?.focus);
  const config: VivaConfig = {
    programmeId,
    stageId: stage.id,
    provider: provider.id,
    model,
    documentIds: opts.documentIds,
    questionPlan,
    style: opts.style,
    mode,
  };
  return createSession({ type: "viva", stageId: stage.id, provider: provider.id, config });
}

export async function* submitUtterance(
  sessionId: string,
  text: string,
  signal?: AbortSignal,
): AsyncGenerator<SessionEvent> {
  const session = getSession(sessionId);
  if (!session) {
    yield { type: "error", code: "session_not_found", message: `Session not found: ${sessionId}` };
    return;
  }
  if (session.status !== "active") {
    yield { type: "error", code: "session_ended", message: "This viva has already ended." };
    return;
  }

  const config = JSON.parse(session.config_json) as VivaConfig;
  const programme = getProgramme(config.programmeId);
  const stage = getStage(config.programmeId, config.stageId);

  let documents: { title: string; text: string }[];
  try {
    documents = loadVivaDocuments(config.documentIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", code: "unknown", message };
    return;
  }
  const systemPrompt = buildPanelSystemPrompt({
    programme,
    stage,
    documents,
    plan: config.questionPlan,
    style: config.style,
    mode: config.mode,
    standingWeaknesses: listFindings({ programmeId: config.programmeId, stageId: stage.id, unresolved: true }).map((f) => ({
      description: f.description,
      evidence: f.evidence,
    })),
  });

  let prior = listMessages(sessionId);
  const beginning = text.trim() === "" && prior.length === 0;
  // Retry: an empty utterance when the candidate's last answer never got a
  // panel reply (provider error) re-sends that answer without duplicating it.
  const retrying =
    text.trim() === "" && prior.length > 0 && prior[prior.length - 1].role === "user";
  let userMessage: string;
  if (beginning) {
    userMessage = BEGIN_MESSAGE;
  } else if (retrying) {
    userMessage = prior[prior.length - 1].content;
    prior = prior.slice(0, -1);
  } else if (text.trim() === "") {
    yield { type: "error", code: "unknown", message: "Nothing to retry — the panel has already replied." };
    return;
  } else {
    userMessage = text;
    appendMessage({ sessionId, role: "user", content: text });
  }

  const transcript: ChatMessage[] = prior.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const req: TurnRequest = {
    systemPrompt,
    userMessage,
    sessionRef: session.provider_session_ref ?? undefined,
    transcript,
    model: config.model,
  };

  const provider = getProvider(config.provider);
  for await (const event of provider.streamTurn(req, signal)) {
    switch (event.type) {
      case "session":
        setProviderSessionRef(sessionId, event.sessionRef);
        break;
      case "delta":
        yield { type: "panel_delta", text: event.text };
        break;
      case "done": {
        clearUsageLimit(config.provider);
        const { content, concluded } = stripVivaCompleteToken(event.fullText);
        if (concluded) endSession(sessionId);
        const row = appendMessage({
          sessionId,
          role: "panel",
          speaker: parseSpeakerTag(content) ?? null,
          content,
        });
        yield { type: "panel_turn_complete", messageId: row.id, content };
        if (concluded) yield { type: "viva_concluded" };
        break;
      }
      case "error":
        // Remember usage-window hits so session setup can steer the user
        // to the other backend until this one resets.
        if (event.code === "usage_limit") recordUsageLimit(config.provider);
        // Do not persist a panel message and do not end the session — the
        // candidate can retry the turn once the underlying issue is fixed.
        yield { type: "error", code: event.code, message: event.message };
        break;
    }
  }
}

export async function endViva(sessionId: string, signal?: AbortSignal): Promise<ReportRow> {
  const report = await generateAssessment(sessionId, signal);
  const session = getSession(sessionId);
  if (session && session.status === "active") endSession(sessionId);
  return report;
}
