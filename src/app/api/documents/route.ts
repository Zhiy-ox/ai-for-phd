import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { documentsDir } from "@/lib/db/client";
import {
  getDocument,
  insertDocument,
  listDocuments,
  updateExtraction,
  type DocumentKind,
} from "@/lib/db/repos/documents";
import { EXTRACTABLE_EXTENSIONS } from "@/lib/extraction/types";
import { extractText } from "@/lib/extraction/extract";

export const dynamic = "force-dynamic";

const DocumentKindSchema = z.enum([
  "transfer_report",
  "confirmation_report",
  "proposal",
  "paper",
  "referee_reports",
  "thesis",
  "other",
]);

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stageId = url.searchParams.get("stageId") ?? undefined;
    const rawKind = url.searchParams.get("kind");
    let kind: DocumentKind | undefined;
    if (rawKind !== null) {
      const parsed = DocumentKindSchema.safeParse(rawKind);
      if (!parsed.success) {
        return Response.json({ error: `Invalid kind: ${rawKind}` }, { status: 400 });
      }
      kind = parsed.data;
    }
    return Response.json({ documents: listDocuments({ stageId, kind }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return Response.json({ error: "Expected multipart/form-data body" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing 'file' field" }, { status: 400 });
    }
    const rawKind = form.get("kind");
    const kindParsed = DocumentKindSchema.safeParse(
      typeof rawKind === "string" && rawKind !== "" ? rawKind : "other",
    );
    if (!kindParsed.success) {
      return Response.json({ error: `Invalid kind: ${String(rawKind)}` }, { status: 400 });
    }
    const rawStageId = form.get("stageId");
    const stageId = typeof rawStageId === "string" && rawStageId !== "" ? rawStageId : null;

    const ext = path.extname(file.name).toLowerCase();
    if (!(EXTRACTABLE_EXTENSIONS as readonly string[]).includes(ext)) {
      return Response.json(
        {
          error: `Unsupported file type "${ext || "(none)"}". Supported: ${EXTRACTABLE_EXTENSIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    await mkdir(documentsDir, { recursive: true });
    const storedName = crypto.randomUUID() + ext;
    const filePath = path.join(documentsDir, storedName);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const row = insertDocument({
      filename: file.name,
      kind: kindParsed.data,
      stageId,
      filePath,
    });

    try {
      const result = await extractText(filePath);
      updateExtraction(row.id, { text: result.text, charCount: result.charCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateExtraction(row.id, { error: message });
    }

    const fresh = getDocument(row.id);
    if (!fresh) {
      return Response.json({ error: "Document row vanished after insert" }, { status: 500 });
    }
    const { extracted_text, ...rest } = fresh;
    return Response.json({ document: { ...rest, has_text: extracted_text !== null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
