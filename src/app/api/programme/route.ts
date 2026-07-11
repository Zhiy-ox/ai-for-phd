import { getActiveProgramme } from "@/lib/programme";
import { ensureSeeded, listStageInstances } from "@/lib/db/repos/stage-instances";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const programme = getActiveProgramme();
    ensureSeeded(programme);
    const instances = listStageInstances(programme.id);
    return Response.json({ programme, instances });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
