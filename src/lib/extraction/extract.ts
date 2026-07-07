import path from "node:path";
import { EXTRACTABLE_EXTENSIONS, ExtractionError } from "./types";
import type { ExtractionResult } from "./types";
import { extractDocxText } from "./docx";
import { extractPdfText } from "./pdf";
import { extractPlainText } from "./plain";

// Normalize extracted text: unify line endings, collapse runs of more than
// two consecutive blank lines down to two, and trim surrounding whitespace.
function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractText(filePath: string): Promise<ExtractionResult> {
  const ext = path.extname(filePath).toLowerCase();
  let raw: string;
  try {
    switch (ext) {
      case ".pdf":
        raw = await extractPdfText(filePath);
        break;
      case ".docx":
        raw = await extractDocxText(filePath);
        break;
      case ".md":
      case ".tex":
      case ".txt":
        raw = await extractPlainText(filePath);
        break;
      default:
        throw new ExtractionError(
          `Unsupported file type "${ext || path.basename(filePath)}". ` +
            `Supported types: ${EXTRACTABLE_EXTENSIONS.join(", ")}.`,
        );
    }
  } catch (err) {
    if (err instanceof ExtractionError) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new ExtractionError(
      `Could not extract text from "${path.basename(filePath)}": ${detail}`,
    );
  }
  const text = normalize(raw);
  return { text, charCount: text.length };
}
