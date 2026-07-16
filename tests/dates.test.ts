import { describe, expect, it } from "vitest";
import { daysUntil, formatCountdown, urgencyOf } from "@/lib/dates";

const TODAY = new Date(2026, 6, 16); // 16 Jul 2026

describe("daysUntil", () => {
  it("counts calendar days regardless of time of day", () => {
    const lateTonight = new Date(2026, 6, 16, 23, 59);
    expect(daysUntil("2026-07-17", lateTonight)).toBe(1);
    expect(daysUntil("2026-07-16", lateTonight)).toBe(0);
  });

  it("is negative for past dates", () => {
    expect(daysUntil("2026-07-10", TODAY)).toBe(-6);
  });

  it("spans months and years", () => {
    expect(daysUntil("2026-08-16", TODAY)).toBe(31);
    expect(daysUntil("2027-07-16", TODAY)).toBe(365);
  });

  it("returns null for garbage", () => {
    expect(daysUntil("", TODAY)).toBeNull();
    expect(daysUntil("soon", TODAY)).toBeNull();
    expect(daysUntil("2026-13-45", TODAY)).toBeNull();
  });
});

describe("urgencyOf", () => {
  it("classifies around the six-week threshold", () => {
    expect(urgencyOf(-1)).toBe("overdue");
    expect(urgencyOf(0)).toBe("urgent");
    expect(urgencyOf(42)).toBe("urgent");
    expect(urgencyOf(43)).toBe("soon");
    expect(urgencyOf(91)).toBe("soon");
    expect(urgencyOf(92)).toBe("comfortable");
  });
});

describe("formatCountdown", () => {
  it("names the near cases", () => {
    expect(formatCountdown(0)).toBe("today");
    expect(formatCountdown(1)).toBe("tomorrow");
    expect(formatCountdown(-1)).toBe("1 day overdue");
    expect(formatCountdown(-14)).toBe("14 days overdue");
  });

  it("switches units as the horizon grows", () => {
    expect(formatCountdown(10)).toBe("10 days left");
    expect(formatCountdown(21)).toBe("3 weeks left");
    expect(formatCountdown(120)).toBe("4 months left");
  });
});
