import { z } from "zod";
import { getReport, updateReportContent } from "@/lib/db/repos/reports";

export const dynamic = "force-dynamic";

const PatchBodySchema = z.object({ contentMd: z.string().min(1) });

// Save user edits to a report's markdown (rebuttal letters polished in-app).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = PatchBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "contentMd is required" }, { status: 400 });
    }
    if (!getReport(id)) {
      return Response.json({ error: `Report not found: ${id}` }, { status: 404 });
    }
    return Response.json({ report: updateReportContent(id, parsed.data.contentMd) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

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
