import { z } from "zod";
import { DEFAULT_PROGRAMME_ID, getProgramme } from "@/lib/template";
import {
  ensureSeeded,
  updateStageInstance,
  type StageInstance,
} from "@/lib/db/repos/stage-instances";

export const dynamic = "force-dynamic";

const PatchBodySchema = z.object({
  status: z.enum(["locked", "upcoming", "active", "passed", "referred"]).optional(),
  targetDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ stageId: string }> },
): Promise<Response> {
  try {
    const { stageId } = await params;
    const parsed = PatchBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    const programme = getProgramme(DEFAULT_PROGRAMME_ID);
    if (!programme.stages.some((s) => s.id === stageId)) {
      return Response.json({ error: `Unknown stage: ${stageId}` }, { status: 404 });
    }
    ensureSeeded(programme);
    const patch: Partial<Pick<StageInstance, "status" | "target_date" | "notes">> = {};
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.targetDate !== undefined) patch.target_date = parsed.data.targetDate;
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
    const instance = updateStageInstance(programme.id, stageId, patch);
    if (!instance) {
      return Response.json({ error: `Stage instance not found: ${stageId}` }, { status: 404 });
    }
    return Response.json({ instance });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
