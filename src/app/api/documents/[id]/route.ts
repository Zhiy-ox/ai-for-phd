import { unlink } from "node:fs/promises";
import { z } from "zod";
import {
  deleteDocument,
  getDocument,
  updateDocumentMeta,
} from "@/lib/db/repos/documents";

export const dynamic = "force-dynamic";

const PatchBodySchema = z.object({
  kind: z.enum(["transfer_report", "proposal", "paper", "other"]).optional(),
  stageId: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const document = getDocument(id);
    if (!document) {
      return Response.json({ error: `Document not found: ${id}` }, { status: 404 });
    }
    return Response.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = PatchBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    if (!getDocument(id)) {
      return Response.json({ error: `Document not found: ${id}` }, { status: 404 });
    }
    const updated = updateDocumentMeta(id, parsed.data);
    if (!updated) {
      return Response.json({ error: `Document not found: ${id}` }, { status: 404 });
    }
    const { extracted_text, ...rest } = updated;
    return Response.json({ document: { ...rest, has_text: extracted_text !== null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const document = getDocument(id);
    if (!document) {
      return Response.json({ error: `Document not found: ${id}` }, { status: 404 });
    }
    deleteDocument(id);
    try {
      await unlink(document.file_path);
    } catch {
      // The row is gone; a missing or locked file is not worth failing over.
    }
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
