import { z } from "zod";
import { CommentImportError, importReviewerComments } from "@/lib/rebuttal/import";

export const dynamic = "force-dynamic";

// The [id] is the manuscript. Comments come either as pasted text or as an
// already-uploaded referee-reports document.
const BodySchema = z
  .object({
    text: z.string().optional(),
    commentsDocumentId: z.string().min(1).optional(),
    provider: z.enum(["claude", "codex"]).optional(),
    model: z.string().optional(),
  })
  .refine((body) => Boolean(body.text?.trim()) !== Boolean(body.commentsDocumentId), {
    message: "Send either pasted text or commentsDocumentId, not both or neither",
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
    }
    const report = await importReviewerComments(
      { manuscriptId: id, ...parsed.data },
      request.signal,
    );
    return Response.json({ reportId: report.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof CommentImportError ? err.status : 500;
    return Response.json({ error: message }, { status });
  }
}
