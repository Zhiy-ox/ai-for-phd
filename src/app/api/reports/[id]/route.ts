import { getReport } from "@/lib/db/repos/reports";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const report = getReport(id);
    if (!report) {
      return Response.json({ error: `Report not found: ${id}` }, { status: 404 });
    }
    return Response.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
