import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  filterReceiptsByPeriod,
  getExpensePeriodLabel,
  receiptsToCsv,
  shiftExpensePeriod,
  summarizeExpenses
} from "../src/expenseAnalytics.js";
import type { Receipt } from "../src/types.js";

function receipt(purchaseDateKey: string, totalCents = 500, storeName = "Shop"): Receipt {
  return {
    source: "manual",
    storeName,
    purchaseDateKey,
    totalCents,
    currency: "EUR",
    lineItems: [{
      rawName: "Apples, fresh",
      name: "Apples",
      quantity: 2,
      amountCents: totalCents,
      category: "Groceries",
      necessity: "essential"
    }],
    dedupeHash: "test",
    createdAt: Timestamp.fromDate(new Date("2026-03-01T00:00:00Z")),
    updatedAt: Timestamp.fromDate(new Date("2026-03-01T00:00:00Z"))
  };
}

describe("expense analytics", () => {
  it("filters date-only receipts using the selected timezone and period", () => {
    const receipts = [
      { id: "before", receipt: receipt("2026-02-28") },
      { id: "match", receipt: receipt("2026-03-02") },
      { id: "after", receipt: receipt("2026-04-01") }
    ];
    expect(filterReceiptsByPeriod(
      receipts,
      new Date("2026-03-15T12:00:00Z"),
      "monthly",
      "Europe/Berlin"
    ).map(({ id }) => id)).toEqual(["match"]);
  });

  it("summarizes receipt totals and line item category totals", () => {
    const summary = summarizeExpenses([
      { receipt: receipt("2026-03-02", 500) },
      { receipt: receipt("2026-03-03", 200) }
    ]);
    expect(summary).toEqual({
      receiptCount: 2,
      totalCents: 700,
      lineItemsTotalCents: 700,
      categories: [{ category: "Groceries", amountCents: 700 }]
    });
  });

  it("generates escaped CSV rows with decimal euro amounts", () => {
    const csv = receiptsToCsv([{ receipt: receipt("2026-03-02", 500, 'Shop, "West"') }]);
    expect(csv).toContain('"Shop, ""West"""');
    expect(csv).toContain('"Apples, fresh"');
    expect(csv).toContain("5.00,EUR");
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("labels periods and shifts selected dates", () => {
    expect(getExpensePeriodLabel(
      new Date("2026-03-15T12:00:00Z"),
      "weekly",
      "Europe/Berlin"
    )).toBe("9 Mar 2026 – 15 Mar 2026");
    expect(shiftExpensePeriod(new Date("2026-03-15T12:00:00Z"), "monthly", 1).getMonth()).toBe(3);
  });
});
