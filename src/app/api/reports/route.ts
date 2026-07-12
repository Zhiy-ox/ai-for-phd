import { z } from "zod";
import { listReports, type ReportType } from "@/lib/db/repos/reports";

export const dynamic = "force-dynamic";

const ReportTypeSchema = z.enum(["viva_assessment", "doc_review", "rebuttal_letter"]);

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawType = url.searchParams.get("type");
    let type: ReportType | undefined;
    if (rawType !== null) {
      const parsed = ReportTypeSchema.safeParse(rawType);
      if (!parsed.success) {
        return Response.json({ error: `Invalid type: ${rawType}` }, { status: 400 });
      }
      type = parsed.data;
    }
    const documentId = url.searchParams.get("documentId") ?? undefined;
    const sessionId = url.searchParams.get("sessionId") ?? undefined;
    return Response.json({ reports: listReports({ documentId, sessionId, type }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
