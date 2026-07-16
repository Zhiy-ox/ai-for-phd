import {
  deleteSession,
  getSession,
  listMessages,
  renameSession,
} from "@/lib/db/repos/sessions";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!getSession(id)) {
      return Response.json({ error: `Session not found: ${id}` }, { status: 404 });
    }
    const body = (await request.json()) as { title?: unknown };
    if (typeof body.title !== "string" && body.title !== null) {
      return Response.json({ error: "title must be a string or null" }, { status: 400 });
    }
    renameSession(id, body.title);
    return Response.json({ session: getSession(id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!getSession(id)) {
      return Response.json({ error: `Session not found: ${id}` }, { status: 404 });
    }
    deleteSession(id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
