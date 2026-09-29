import { getDb } from "../client";
import { getStage, hasWrittenPeerReview } from "@/lib/template";

export type PanelProgress = "not_started" | "in_progress" | "complete";

export interface StageActivity {
  readable: number;
  reviews: number;
  reports: number;
  latestReportId: string | null;
  panelState: PanelProgress;
}

interface ActivityCounts {
  readable: number;
  reviews: number;
  reports: number;
  latest_report_id: string | null;
  panel_sessions: number;
  ended_panel_sessions: number;
  viva_assessments: number;
}

/** Compact, programme-scoped progress facts for the guided stage path. */
export function getStageActivity(programmeId: string, stageId: string): StageActivity {
  const writtenPeerReview = hasWrittenPeerReview(getStage(programmeId, stageId));
  const counts = getDb()
    .prepare(
      `SELECT
         (
           SELECT COUNT(*)
           FROM documents d
           WHERE d.programme_id = ? AND d.stage_id = ?
             AND d.extracted_text IS NOT NULL
             ${writtenPeerReview ? "AND d.kind = 'paper'" : ""}
         ) AS readable,
         (
           SELECT COUNT(*)
           FROM reports r
           JOIN documents d ON d.id = r.document_id
           WHERE d.programme_id = ? AND d.stage_id = ? AND r.type = 'doc_review'
             ${
               writtenPeerReview
                 ? "AND CASE WHEN json_valid(r.rubric_json) THEN json_extract(r.rubric_json, '$.format') END = 'peer_review'"
                 : ""
             }
         ) AS reviews,
         (
           SELECT COUNT(DISTINCT r.id)
           FROM reports r
           LEFT JOIN documents d ON d.id = r.document_id
           LEFT JOIN sessions s ON s.id = r.session_id
           WHERE (d.programme_id = ? AND d.stage_id = ?)
              OR (s.programme_id = ? AND s.stage_id = ?)
         ) AS reports,
         (
           SELECT r.id
           FROM reports r
           LEFT JOIN documents d ON d.id = r.document_id
           LEFT JOIN sessions s ON s.id = r.session_id
           WHERE (d.programme_id = ? AND d.stage_id = ?)
              OR (s.programme_id = ? AND s.stage_id = ?)
           ORDER BY r.created_at DESC, r.rowid DESC
           LIMIT 1
         ) AS latest_report_id,
         (
           SELECT COUNT(*)
           FROM sessions s
           WHERE s.programme_id = ? AND s.stage_id = ? AND s.type = 'viva'
         ) AS panel_sessions,
         (
           SELECT COUNT(*)
           FROM sessions s
           WHERE s.programme_id = ? AND s.stage_id = ?
             AND s.type = 'viva' AND s.status = 'ended'
         ) AS ended_panel_sessions,
         (
           SELECT COUNT(*)
           FROM reports r
           JOIN sessions s ON s.id = r.session_id
           WHERE s.programme_id = ? AND s.stage_id = ?
             AND s.type = 'viva' AND r.type = 'viva_assessment'
         ) AS viva_assessments`,
    )
    .get(
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
      programmeId,
      stageId,
    ) as unknown as ActivityCounts;

  const panelState: PanelProgress =
    counts.ended_panel_sessions > 0 || counts.viva_assessments > 0
      ? "complete"
      : counts.panel_sessions > 0
        ? "in_progress"
        : "not_started";

  return {
    readable: counts.readable,
    reviews: counts.reviews,
    reports: counts.reports,
    latestReportId: counts.latest_report_id,
    panelState,
  };
}
