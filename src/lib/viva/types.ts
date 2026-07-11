import type { ProviderErrorCode, ProviderId } from "@/lib/providers/types";

// User-chosen examiner style for a session.
export interface PanelStyle {
  // supportive: encouraging rehearsal · standard: realistic · hostile: worst-day pressure
  intensity: "supportive" | "standard" | "hostile";
  // Optional area the candidate asked to be pressed on.
  focus?: string;
}

// Stored in sessions.config_json for viva sessions.
export interface VivaConfig {
  programmeId: string;
  stageId: string;
  provider: ProviderId;
  model?: string;
  // Primary report first, then supporting documents.
  documentIds: string[];
  questionPlan?: QuestionPlan;
  style?: PanelStyle;
}

export interface QuestionPlan {
  areas: {
    rubricId: string;
    title: string;
    seedQuestions: string[];
    // Specific weak points in the actual report worth attacking.
    weakSpots: string[];
  }[];
}

// Modality-agnostic session events. The SSE route is one consumer; a future
// voice layer consumes the same stream.
export type SessionEvent =
  | { type: "panel_delta"; text: string }
  | { type: "panel_turn_complete"; messageId: string; content: string }
  | { type: "viva_concluded" }
  | {
      type: "error";
      code: ProviderErrorCode | "session_not_found" | "session_ended";
      message: string;
    };

// Emitted alone on the panel's final line when the viva should end.
export const VIVA_COMPLETE_TOKEN = "<viva-complete/>";

export interface VivaAssessment {
  criteria: { id: string; score: number; comments: string }[];
  strengths: string[];
  weaknesses: string[];
  // Verdict id from the stage template's assessment.verdicts.
  verdict: string;
  narrative_md: string;
  // Present only when standing weaknesses were provided to the assessment:
  // the panel's judgement on each carried-over weakness.
  weakness_updates?: { id: string; status: "resolved" | "improving" | "still_open" }[];
}

// Contracts implemented in engine.ts / report.ts:
//   startVivaSession(opts: { stageId; provider; documentIds; model? }): Promise<SessionRow>
//     - creates the session row, runs the planner, persists VivaConfig.
//   submitUtterance(sessionId: string, text: string, signal?: AbortSignal):
//       AsyncGenerator<SessionEvent>
//     - empty `text` with no prior messages begins the viva (panel opening +
//       first question); persists both sides of every turn.
//   endViva(sessionId: string, signal?: AbortSignal): Promise<ReportRow>
//     - generates the assessment report, marks the session ended.
