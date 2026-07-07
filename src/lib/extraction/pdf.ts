import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

// PDF text extraction via unpdf (serverless-friendly pdf.js build).
export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  // With mergePages: true the result is a string, but guard against the
  // per-page string[] shape as well.
  return Array.isArray(text) ? text.join("\n\n") : text;
}
