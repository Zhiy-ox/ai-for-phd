export interface ExtractionResult {
  text: string;
  charCount: number;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export const EXTRACTABLE_EXTENSIONS = [".pdf", ".docx", ".md", ".tex", ".txt"] as const;

// Contract implemented in extract.ts:
//   extractText(filePath: string): Promise<ExtractionResult>
//     - dispatches on extension; throws ExtractionError with a user-facing
//       message on unsupported types or parse failures.
