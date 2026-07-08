import { z } from "zod";
import { DEFAULT_PROGRAMME_ID, getProgramme } from "@/lib/template";
import { setCurrentStage } from "@/lib/db/repos/stage-instances";
import { setSettings } from "@/lib/db/repos/settings";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ stageId: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "stageId is required" }, { status: 400 });
    }
    const programme = getProgramme(DEFAULT_PROGRAMME_ID);
    if (!programme.stages.some((s) => s.id === parsed.data.stageId)) {
      return Response.json(
        { error: `Unknown stage: ${parsed.data.stageId}` },
        { status: 404 },
      );
    }
    const instances = setCurrentStage(programme, parsed.data.stageId);
    setSettings({ current_stage: parsed.data.stageId });
    return Response.json({ instances });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
