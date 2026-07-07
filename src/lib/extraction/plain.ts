import { readFile } from "node:fs/promises";

// Raw UTF-8 read for plain-text formats (.md, .tex, .txt).
export async function extractPlainText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
