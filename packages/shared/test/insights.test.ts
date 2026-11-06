import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildSpendingInsightReport } from "../src/insights.js";
import type { Budget, Receipt } from "../src/types.js";

function makeReceipt(date: string, totalCents: number, category: "Groceries" | "Cafe & Eating out", necessity: "essential" | "discretionary"): Receipt {
  const timestamp = Timestamp.fromDate(new Date(`${date}T12:00:00Z`));
  return {
    source: "manual",
    storeName: "Market",
    purchaseDateKey: date,
    totalCents,
    currency: "EUR",
    lineItems: [{
      rawName: "Item",
      name: "Item",
      quantity: 1,
      amountCents: totalCents,
      category,
      necessity
    }],
    dedupeHash: date,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("buildSpendingInsightReport", () => {
  it("compares the current and previous local month and reports category/discretionary details", () => {
    const result = buildSpendingInsightReport([
      { id: "current", receipt: makeReceipt("2026-11-02", 12000, "Groceries", "essential") },
      { id: "previous", receipt: makeReceipt("2026-10-10", 10000, "Cafe & Eating out", "discretionary") }
    ], new Date("2026-11-05T12:00:00Z"), "Europe/Berlin", ["Cafe & Eating out"]);
    expect(result.report.aggregate.currentPeriod.totalCents).toBe(12000);
    expect(result.report.aggregate.previousPeriod.totalCents).toBe(10000);
    expect(result.report.aggregate.discretionarySharePercent).toBe(0);
    expect(result.report.messages[0]?.detail).toContain("+20,00 € (20%)");
    expect(result.aiContext.budgetSummaries).toEqual([]);
  });

  it("generates actionable deterministic budget messages", () => {
    const timestamp = Timestamp.fromDate(new Date("2026-11-01T00:00:00Z"));
    const budget: Budget = {
      name: "Food",
      period: "monthly",
      amountCents: 10000,
      scope: { type: "overall" },
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const result = buildSpendingInsightReport([
      { id: "current", receipt: makeReceipt("2026-11-02", 12000, "Groceries", "essential") }
    ], new Date("2026-11-05T12:00:00Z"), "Europe/Berlin", [], [{ budget }]);
    expect(result.report.messages.map(({ id }) => id)).toContain("budget-Food");
    expect(result.report.messages.find(({ id }) => id === "budget-Food")?.title).toBe("Food is over budget");
    expect(result.aiContext.budgetSummaries[0]?.spentCents).toBe(12000);
  });
});
