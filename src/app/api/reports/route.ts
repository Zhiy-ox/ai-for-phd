import { z } from "zod";
import {
  listReports,
  listReportSummaries,
  type ReportType,
} from "@/lib/db/repos/reports";
import { getActiveProgrammeId } from "@/lib/programme";

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
    const stageId = url.searchParams.get("stageId") ?? undefined;
    const summary = url.searchParams.get("summary") === "1";
    const filter = {
      programmeId: getActiveProgrammeId(),
      stageId,
      documentId,
      sessionId,
      type,
    };
    return Response.json({
      reports: summary ? listReportSummaries(filter) : listReports(filter),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
