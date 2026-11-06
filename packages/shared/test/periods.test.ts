import { describe, expect, it } from "vitest";
import { getPeriodBounds, isValidDateKey, isValidTime } from "../src/periods.js";

describe("getPeriodBounds", () => {
  it("starts weekly periods on Monday in the selected timezone", () => {
    const bounds = getPeriodBounds(
      new Date("2026-11-05T12:00:00.000Z"),
      "weekly",
      "Europe/Berlin"
    );

    expect(bounds.key).toBe("2026-11-02");
    expect(bounds.start.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-11-08T23:00:00.000Z");
  });

  describe("date and time keys", () => {
    it("validates leap days without depending on the machine timezone", () => {
      expect(isValidDateKey("2024-02-29")).toBe(true);
      expect(isValidDateKey("2026-02-29")).toBe(false);
      expect(isValidDateKey("2026-11-05")).toBe(true);
      expect(isValidDateKey("2026-13-01")).toBe(false);
    });

    it("validates 24-hour purchase times", () => {
      expect(isValidTime("00:00")).toBe(true);
      expect(isValidTime("23:59")).toBe(true);
      expect(isValidTime("24:00")).toBe(false);
    });
  });

  it("uses the actual DST-adjusted duration of a local day", () => {
    const bounds = getPeriodBounds(
      new Date("2026-03-29T12:00:00.000Z"),
      "day",
      "Europe/Berlin"
    );

    expect(bounds.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("includes the full local calendar month", () => {
    const bounds = getPeriodBounds(
      new Date("2026-02-28T23:30:00.000Z"),
      "monthly",
      "Europe/Berlin"
    );

    expect(bounds.key).toBe("2026-03");
    expect(bounds.start.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });
});
