import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mammoth from "mammoth";
import { extractText } from "@/lib/extraction/extract";
import { extractDocxText } from "@/lib/extraction/docx";
import { ExtractionError } from "@/lib/extraction/types";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({
      value: "Mocked docx body about liquid-crystal photonics.\n",
      messages: [],
    })),
  },
}));

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const fixture = (name: string) => path.join(fixturesDir, name);

describe("extractText", () => {
  it("extracts markdown fixtures verbatim", async () => {
    const result = await extractText(fixture("sample.md"));
    expect(result.text).toContain("Liquid-Crystal Photonic Architectures");
    expect(result.text).toContain("two-photon polymerization (2PP)");
    expect(result.text).toContain("87% first-order diffraction");
    expect(result.charCount).toBe(result.text.length);
  });

  it("extracts plain-text fixtures verbatim", async () => {
    const result = await extractText(fixture("sample.txt"));
    expect(result.text).toContain("Liquid-Crystal Photonics");
    expect(result.text).toContain("depth-varying director profiles");
    expect(result.text).toContain("achromatic Pancharatnam-Berry lens");
    expect(result.charCount).toBe(result.text.length);
  });

  it("extracts text from a PDF fixture", async () => {
    const result = await extractText(fixture("sample.pdf"));
    expect(result.text).toContain("LC photonics transfer report");
    expect(result.charCount).toBe(result.text.length);
  });

  it("throws ExtractionError for unsupported extensions", async () => {
    await expect(extractText(fixture("archive.zip"))).rejects.toThrow(ExtractionError);
    await expect(extractText(fixture("archive.zip"))).rejects.toThrow(/unsupported file type/i);
  });

  it("throws ExtractionError for a missing file", async () => {
    await expect(extractText(fixture("does-not-exist.txt"))).rejects.toThrow(ExtractionError);
    await expect(extractText(fixture("does-not-exist.txt"))).rejects.toThrow(
      /does-not-exist\.txt/,
    );
  });

  describe("normalization", () => {
    let tempDir: string;

    beforeAll(async () => {
      tempDir = await mkdtemp(path.join(tmpdir(), "extraction-test-"));
    });

    afterAll(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("collapses runs of more than two blank lines and trims", async () => {
      const messy = path.join(tempDir, "messy.txt");
      await writeFile(messy, "\n\n  \nalpha\n\n\n\n\n\nbeta\r\n\r\ngamma\n\n\n", "utf8");
      const result = await extractText(messy);
      expect(result.text).toBe("alpha\n\n\nbeta\n\ngamma");
      expect(result.charCount).toBe(result.text.length);
    });
  });
});

describe("extractDocxText", () => {
  it("passes the file path to mammoth and returns the raw text value", async () => {
    const text = await extractDocxText("/some/where/report.docx");
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ path: "/some/where/report.docx" });
    expect(text).toBe("Mocked docx body about liquid-crystal photonics.\n");
  });

  it("plumbs through extractText with normalization", async () => {
    const result = await extractText("/some/where/report.docx");
    expect(result.text).toBe("Mocked docx body about liquid-crystal photonics.");
    expect(result.charCount).toBe(result.text.length);
  });

  it("wraps mammoth failures in ExtractionError", async () => {
    vi.mocked(mammoth.extractRawText).mockRejectedValueOnce(new Error("corrupt zip"));
    const err = await extractText("/some/where/broken.docx").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).message).toMatch(/broken\.docx/);
    expect((err as ExtractionError).message).toMatch(/corrupt zip/);
  });
});
