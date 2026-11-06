import { describe, expect, it } from "vitest";
import { classifyLineItem, normalizeGermanName } from "../src/classify.js";
import { dedupeHash } from "../src/dedupe.js";

describe("German line-item classification", () => {
  it("normalizes German names consistently", () => {
    expect(normalizeGermanName("Gummibärchen & Käse")).toBe("gummibaerchen kaese");
  });

  it.each([
    ["Cappuccino", "Cafe & Eating out", "discretionary"],
    ["Marlboro Gold", "Tobacco", "discretionary"],
    ["Red Bull", "Beverages", "neutral"],
    ["Pfand Rückgabe", "Deposit/Pfand", "neutral"],
    ["Vollmilch", "Groceries", "essential"]
  ] as const)("classifies %s", (itemName, category, necessity) => {
    expect(classifyLineItem(itemName)).toEqual({ category, necessity });
  });

  it("honors configured discretionary categories for known categories", () => {
    expect(classifyLineItem("Chips", ["Groceries"]).necessity).toBe("neutral");
  });

  it("defaults unknown names to essential groceries", () => {
    expect(classifyLineItem("mystery item")).toEqual({ category: "Groceries", necessity: "essential" });
  });
});

describe("dedupeHash", () => {
  it("normalizes store names and is stable for the same receipt key", () => {
    expect(dedupeHash("MÜLLER", "2026-11-05", 1299))
      .toBe(dedupeHash("Müller", "2026-11-05", 1299));
    expect(dedupeHash("Store", "2026-11-05", 1299))
      .not.toBe(dedupeHash("Store", "2026-11-05", 1300));
  });

  it("rejects fractional cent totals", () => {
    expect(() => dedupeHash("Store", "2026-11-05", 1.5)).toThrow(RangeError);
  });
});
