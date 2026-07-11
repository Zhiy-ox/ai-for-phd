// Weakness-ledger repo: dedup, filters, status transitions — against a
// throwaway SQLite db in a temp DATA_DIR (set before the client module loads).
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "aiphd-findings-"));

const { insertFinding, listFindings, updateFindingStatus, getFinding } = await import(
  "@/lib/db/repos/findings"
);
const { VivaAssessmentSchema } = await import("@/lib/viva/prompts");

describe("findings repo", () => {
  it("inserts and reads back a finding", () => {
    const row = insertFinding({
      stageId: "transfer",
      description: "Feasibility plan ignores cleanroom lead times",
      evidence: "two fabrication rounds per term",
      sourceType: "doc_review",
      sourceId: "report-1",
    });
    expect(row).not.toBeNull();
    expect(row!.status).toBe("open");
    expect(getFinding(row!.id)?.description).toContain("cleanroom");
  });

  it("dedupes unresolved findings case-insensitively per stage", () => {
    const dup = insertFinding({
      stageId: "transfer",
      description: "FEASIBILITY plan ignores cleanroom lead times",
      sourceType: "viva_assessment",
    });
    expect(dup).toBeNull();
    // Same text on another stage is a distinct finding.
    const other = insertFinding({
      stageId: "confirmation",
      description: "Feasibility plan ignores cleanroom lead times",
      sourceType: "viva_assessment",
    });
    expect(other).not.toBeNull();
  });

  it("filters by stage, status, and unresolved", () => {
    expect(listFindings({ stageId: "transfer" })).toHaveLength(1);
    expect(listFindings({ stageId: "transfer", status: "open" })).toHaveLength(1);
    expect(listFindings({ stageId: "transfer", unresolved: true })).toHaveLength(1);
    expect(listFindings({ stageId: "transfer", status: "resolved" })).toHaveLength(0);
  });

  it("updates status and allows re-raising after resolution", () => {
    const [row] = listFindings({ stageId: "transfer" });
    const improved = updateFindingStatus(row.id, "improving");
    expect(improved?.status).toBe("improving");
    // Still unresolved → still deduped.
    expect(
      insertFinding({
        stageId: "transfer",
        description: row.description,
        sourceType: "viva_assessment",
      }),
    ).toBeNull();
    updateFindingStatus(row.id, "resolved");
    expect(listFindings({ stageId: "transfer", unresolved: true })).toHaveLength(0);
    // Resolved → the same weakness may be recorded fresh if it regresses.
    const reraised = insertFinding({
      stageId: "transfer",
      description: row.description,
      sourceType: "viva_assessment",
    });
    expect(reraised).not.toBeNull();
  });

  it("rejects empty descriptions", () => {
    expect(
      insertFinding({ stageId: "transfer", description: "   ", sourceType: "doc_review" }),
    ).toBeNull();
  });
});

describe("assessment schema with weakness updates", () => {
  const base = {
    criteria: [{ id: "originality", score: 3, comments: "ok" }],
    strengths: ["s"],
    weaknesses: ["w"],
    verdict: "approved",
    narrative_md: "n",
  };

  it("accepts assessments without weakness_updates (backward compatible)", () => {
    expect(VivaAssessmentSchema.safeParse(base).success).toBe(true);
  });

  it("accepts and validates weakness_updates", () => {
    const parsed = VivaAssessmentSchema.safeParse({
      ...base,
      weakness_updates: [{ id: "abc", status: "resolved" }],
    });
    expect(parsed.success).toBe(true);
    const bad = VivaAssessmentSchema.safeParse({
      ...base,
      weakness_updates: [{ id: "abc", status: "fixed" }],
    });
    expect(bad.success).toBe(false);
  });
});
