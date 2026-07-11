import { z } from "zod";
import { listFindings, type FindingStatus } from "@/lib/db/repos/findings";

export const dynamic = "force-dynamic";

const StatusSchema = z.enum(["open", "improving", "resolved"]);

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stageId = url.searchParams.get("stageId") ?? undefined;
    const rawStatus = url.searchParams.get("status");
    let status: FindingStatus | undefined;
    if (rawStatus !== null) {
      const parsed = StatusSchema.safeParse(rawStatus);
      if (!parsed.success) {
        return Response.json({ error: `Invalid status: ${rawStatus}` }, { status: 400 });
      }
      status = parsed.data;
    }
    const unresolved = url.searchParams.get("unresolved") === "1";
    return Response.json({ findings: listFindings({ stageId, status, unresolved }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
