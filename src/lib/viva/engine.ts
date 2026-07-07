// Mock-viva session engine: session lifecycle + one streamed turn at a time.
// Implements the contracts documented in ./types.ts.
import { DEFAULT_PROGRAMME_ID, getProgramme, getStage } from "@/lib/template";
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
import type { ReportRow } from "@/lib/db/repos/reports";
import { buildPanelSystemPrompt, parseSpeakerTag, stripVivaCompleteToken } from "./prompts";
import { generateQuestionPlan } from "./planner";
import { generateAssessment } from "./report";
import type { SessionEvent, VivaConfig } from "./types";

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
}): Promise<SessionRow> {
  if (opts.documentIds.length === 0) {
    throw new Error("A mock viva needs at least one document.");
  }
  const stage = getStage(DEFAULT_PROGRAMME_ID, opts.stageId);
  if (!stage.assessment) {
    throw new Error(`Stage "${stage.id}" does not define a viva panel.`);
  }
  const { provider, model } = resolveProviderAndModel(opts);
  const documents = loadVivaDocuments(opts.documentIds);
  const questionPlan = await generateQuestionPlan(provider, model, stage, documents[0].text);
  const config: VivaConfig = {
    programmeId: DEFAULT_PROGRAMME_ID,
    stageId: stage.id,
    provider: provider.id,
    model,
    documentIds: opts.documentIds,
    questionPlan,
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
  });

  const prior = listMessages(sessionId);
  const beginning = text.trim() === "" && prior.length === 0;
  const userMessage = beginning ? BEGIN_MESSAGE : text;
  if (!beginning) {
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
