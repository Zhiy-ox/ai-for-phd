import mammoth from "mammoth";

// DOCX text extraction via mammoth's raw-text mode.
export async function extractDocxText(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}
