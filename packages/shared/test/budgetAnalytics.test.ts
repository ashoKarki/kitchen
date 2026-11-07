import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  budgetScopeLabel,
  getBudgetPeriodBounds,
  getBudgetSpendCents,
  getDateKeyInTimeZone,
  getHighestReachedBudgetThreshold
} from "../src/budgetAnalytics.js";
import type { Receipt } from "../src/types.js";

function makeReceipt(totalCents: number, lineItems: Receipt["lineItems"]): Receipt {
  const timestamp = Timestamp.fromDate(new Date("2026-03-01T00:00:00Z"));
  return {
    source: "manual",
    storeName: "Shop",
    purchaseDateKey: "2026-03-01",
    totalCents,
    currency: "EUR",
    lineItems,
    dedupeHash: "test",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const receipt = makeReceipt(1600, [
  { rawName: "Milk", name: "Milk", quantity: 1, amountCents: 500, category: "Groceries", necessity: "essential" },
  { rawName: "Cake", name: "Cake", quantity: 1, amountCents: 700, category: "Snacks & Sweets", necessity: "discretionary" },
  { rawName: "Bottle", name: "Bottle", quantity: 1, amountCents: 400, category: "Beverages", necessity: "neutral" }
]);

describe("budget analytics", () => {
  it("calculates timezone-aware weekly and monthly bounds", () => {
    const weekly = getBudgetPeriodBounds(new Date("2026-11-05T12:00:00Z"), "weekly", "Europe/Berlin");
    const monthly = getBudgetPeriodBounds(new Date("2026-11-05T12:00:00Z"), "monthly", "Europe/Berlin");
    expect(weekly.key).toBe("2026-11-02");
    expect(monthly.key).toBe("2026-11");
    expect(getDateKeyInTimeZone(weekly.start, "Europe/Berlin")).toBe("2026-11-02");
  });

  it("calculates overall, category, and discretionary spend", () => {
    expect(getBudgetSpendCents([receipt], { type: "overall" }, [])).toBe(1600);
    expect(getBudgetSpendCents([receipt], { type: "categories", categories: ["Groceries", "Beverages"] }, [])).toBe(900);
    expect(getBudgetSpendCents([receipt], { type: "discretionary" }, ["Beverages"])).toBe(400);
    expect(budgetScopeLabel({ type: "overall" })).toBe("All spending");
  });

  it("returns the highest threshold on the stepped alert ladder using integer cents", () => {
    const cases: Array<[number, number | null]> = [
      [6999, null],
      [7000, 70],
      [8900, 80],
      [9000, 90],
      [9199, 90],
      [9200, 92],
      [9799, 96],
      [9800, 98],
      [9999, 98],
      [10000, 100],
      [10999, 100],
      [11000, 110],
      [12000, 120]
    ];
    for (const [spent, threshold] of cases) {
      expect(getHighestReachedBudgetThreshold(spent, 10000)).toBe(threshold);
    }
    expect(() => getHighestReachedBudgetThreshold(1, 0)).toThrow(RangeError);
  });
});
