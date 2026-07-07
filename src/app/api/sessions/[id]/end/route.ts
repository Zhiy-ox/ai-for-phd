import { getSession } from "@/lib/db/repos/sessions";
import { endViva } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!getSession(id)) {
      return Response.json({ error: `Session not found: ${id}` }, { status: 404 });
    }
    const report = await endViva(id, request.signal);
    return Response.json({ reportId: report.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
