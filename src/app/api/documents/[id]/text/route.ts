import { z } from "zod";
import { getDocument, updateExtraction } from "@/lib/db/repos/documents";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  text: z.string().min(1, "text must not be empty"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    if (!getDocument(id)) {
      return Response.json({ error: `Document not found: ${id}` }, { status: 404 });
    }
    updateExtraction(id, {
      text: parsed.data.text,
      charCount: parsed.data.text.length,
      error: null,
    });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
