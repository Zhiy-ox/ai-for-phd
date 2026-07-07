import { z } from "zod";
import { getDocument } from "@/lib/db/repos/documents";
import { getSettings } from "@/lib/db/repos/settings";
import { runDocReview } from "@/lib/review/run";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  provider: z.enum(["claude", "codex"]).optional(),
  stageId: z.string().optional(),
  model: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    const document = getDocument(id);
    if (!document) {
      return Response.json({ error: `Document not found: ${id}` }, { status: 404 });
    }
    const provider = parsed.data.provider ?? getSettings().default_provider;
    const stageId = parsed.data.stageId ?? document.stage_id ?? "transfer";
    const report = await runDocReview(
      id,
      { provider, stageId, model: parsed.data.model },
      request.signal,
    );
    return Response.json({ reportId: report.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
