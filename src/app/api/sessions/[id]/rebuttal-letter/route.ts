import { draftRebuttalLetter } from "@/lib/rebuttal/run";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const report = await draftRebuttalLetter(id, request.signal);
    return Response.json({ reportId: report.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
