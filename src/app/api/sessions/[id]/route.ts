import { getSession, listMessages } from "@/lib/db/repos/sessions";
import { listReports } from "@/lib/db/repos/reports";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
      return Response.json({ error: `Session not found: ${id}` }, { status: 404 });
    }
    return Response.json({
      session,
      messages: listMessages(id),
      reports: listReports({ sessionId: id }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
