import { getStageActivity } from "@/lib/db/repos/stage-activity";
import { getActiveProgramme } from "@/lib/programme";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ stageId: string }> },
): Promise<Response> {
  try {
    const { stageId } = await params;
    const programme = getActiveProgramme();
    if (!programme.stages.some((stage) => stage.id === stageId)) {
      return Response.json({ error: `Unknown stage: ${stageId}` }, { status: 404 });
    }
    return Response.json({ activity: getStageActivity(programme.id, stageId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
