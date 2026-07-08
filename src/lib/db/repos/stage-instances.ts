import { getDb } from "../client";
import type { ProgrammeTemplate } from "@/lib/template";

export type StageStatus = "locked" | "upcoming" | "active" | "passed" | "referred";

export interface StageInstance {
  programme_id: string;
  stage_id: string;
  status: StageStatus;
  target_date: string | null;
  notes: string | null;
}

// Seed rows for any stage missing an instance. Heuristic defaults: stages
// before the first implemented stage are 'passed', the first implemented
// stage is 'active', everything after is 'upcoming'. All user-editable.
export function ensureSeeded(programme: ProgrammeTemplate): void {
  const db = getDb();
  const existing = new Set(
    (db
      .prepare("SELECT stage_id FROM stage_instances WHERE programme_id = ?")
      .all(programme.id) as { stage_id: string }[]).map((r) => r.stage_id),
  );
  const ordered = [...programme.stages].sort((a, b) => a.ordinal - b.ordinal);
  const firstImplemented = ordered.findIndex((s) => s.implemented);
  const insert = db.prepare(
    "INSERT INTO stage_instances (programme_id, stage_id, status) VALUES (?, ?, ?)",
  );
  ordered.forEach((stage, i) => {
    if (existing.has(stage.id)) return;
    let status: StageStatus = "upcoming";
    if (firstImplemented >= 0) {
      if (i < firstImplemented) status = "passed";
      else if (i === firstImplemented) status = "active";
    }
    insert.run(programme.id, stage.id, status);
  });
}

// The user declares where they are: earlier stages become 'passed', the
// chosen stage 'active', later ones 'upcoming'. Recurring stages (papers)
// stay 'active' once reached — they run alongside everything after them.
// Individual statuses remain editable per stage afterwards.
export function setCurrentStage(
  programme: ProgrammeTemplate,
  stageId: string,
): StageInstance[] {
  ensureSeeded(programme);
  const ordered = [...programme.stages].sort((a, b) => a.ordinal - b.ordinal);
  const idx = ordered.findIndex((s) => s.id === stageId);
  if (idx < 0) throw new Error(`Unknown stage ${stageId} in programme ${programme.id}`);
  const db = getDb();
  const update = db.prepare(
    "UPDATE stage_instances SET status = ? WHERE programme_id = ? AND stage_id = ?",
  );
  ordered.forEach((stage, i) => {
    let status: StageStatus;
    if (i === idx) status = "active";
    else if (i < idx) status = stage.gate.type === "recurring" ? "active" : "passed";
    else status = "upcoming";
    update.run(status, programme.id, stage.id);
  });
  return listStageInstances(programme.id);
}

export function listStageInstances(programmeId: string): StageInstance[] {
  return getDb()
    .prepare("SELECT * FROM stage_instances WHERE programme_id = ?")
    .all(programmeId) as unknown as StageInstance[];
}

export function getStageInstance(programmeId: string, stageId: string): StageInstance | null {
  return (getDb()
    .prepare("SELECT * FROM stage_instances WHERE programme_id = ? AND stage_id = ?")
    .get(programmeId, stageId) ?? null) as StageInstance | null;
}

export function updateStageInstance(
  programmeId: string,
  stageId: string,
  patch: Partial<Pick<StageInstance, "status" | "target_date" | "notes">>,
): StageInstance | null {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.target_date !== undefined) {
    sets.push("target_date = ?");
    values.push(patch.target_date);
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    values.push(patch.notes);
  }
  if (sets.length > 0) {
    db.prepare(
      `UPDATE stage_instances SET ${sets.join(", ")} WHERE programme_id = ? AND stage_id = ?`,
    ).run(...values, programmeId, stageId);
  }
  return getStageInstance(programmeId, stageId);
}
