import { z } from "zod";
import { draftRebuttalLetterFromReview, RebuttalRequestError } from "@/lib/rebuttal/run";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  provider: z.enum(["claude", "codex"]).optional(),
  model: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    const report = await draftRebuttalLetterFromReview(id, parsed.data, request.signal);
    return Response.json({ reportId: report.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof RebuttalRequestError ? err.status : 500;
    return Response.json({ error: message }, { status });
  }
}
