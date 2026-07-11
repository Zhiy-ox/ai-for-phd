import { z } from "zod";
import { getFinding, updateFindingStatus } from "@/lib/db/repos/findings";

export const dynamic = "force-dynamic";

const PatchBodySchema = z.object({
  status: z.enum(["open", "improving", "resolved"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = PatchBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "status must be open|improving|resolved" }, { status: 400 });
    }
    if (!getFinding(id)) {
      return Response.json({ error: `Finding not found: ${id}` }, { status: 404 });
    }
    return Response.json({ finding: updateFindingStatus(id, parsed.data.status) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
