import { z } from "zod";
import { sseResponse } from "@/lib/sse";
import { submitUtterance } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // Empty text with no prior messages begins the viva.
  text: z.string(),
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
    return sseResponse(submitUtterance(id, parsed.data.text), request.signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
