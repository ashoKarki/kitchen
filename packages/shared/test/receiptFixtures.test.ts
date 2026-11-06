import { readFileSync } from "node:fs";
import { classifyLineItem } from "../src/classify.js";
import { dedupeHash } from "../src/dedupe.js";
import { isValidDateKey, isValidTime } from "../src/periods.js";
import { expenseCategories } from "../src/types.js";
import { describe, expect, it } from "vitest";

interface ReceiptFixture {
  id: string;
  rawText: string;
  storeName: string;
  purchaseDateKey: string;
  purchaseTime: string;
  totalCents: number;
  paymentMethod: "cash" | "card" | "other";
  lineItems: Array<{
    rawName: string;
    name: string;
    quantity: number;
    amountCents: number;
    category: string;
    necessity: "essential" | "discretionary" | "neutral";
    isDeposit?: boolean;
  }>;
}

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/receipts.de.json", import.meta.url), "utf8")
) as ReceiptFixture[];

describe("German receipt fixtures", () => {
  it("contains realistic German-language sample text without total mismatches", () => {
    expect(fixtures).toHaveLength(3);
    for (const fixture of fixtures) {
      expect(fixture.rawText).toMatch(/SUMME|GESAMT|EUR/);
      expect(fixture.rawText).toMatch(/\d{1,2}[,.]\d{2}/);
      expect(fixture.lineItems.reduce((sum, item) => sum + item.amountCents, 0))
        .toBe(fixture.totalCents);
    }
  });

  it("uses valid dates, times, line-item values, and known categories", () => {
    for (const fixture of fixtures) {
      expect(isValidDateKey(fixture.purchaseDateKey)).toBe(true);
      expect(isValidTime(fixture.purchaseTime)).toBe(true);
      expect(Number.isSafeInteger(fixture.totalCents)).toBe(true);
      expect(fixture.lineItems.length).toBeGreaterThan(0);
      for (const item of fixture.lineItems) {
        expect(item.rawName.length).toBeGreaterThan(0);
        expect(item.name.length).toBeGreaterThan(0);
        expect(Number.isInteger(item.quantity)).toBe(true);
        expect(Number.isSafeInteger(item.amountCents)).toBe(true);
        expect(expenseCategories).toContain(item.category);
      }
    }
  });

  it("keeps distinct sample receipts deduplicated and preserves Pfand returns", () => {
    const hashes = fixtures.map((fixture) =>
      dedupeHash(fixture.storeName, fixture.purchaseDateKey, fixture.totalCents)
    );
    expect(new Set(hashes).size).toBe(fixtures.length);

    const pfandReturn = fixtures
      .flatMap((fixture) => fixture.lineItems)
      .find((item) => item.rawName === "Pfandrückgabe");
    expect(pfandReturn).toMatchObject({
      amountCents: -25,
      category: "Deposit/Pfand",
      isDeposit: true
    });
  });

  it("classifies representative German receipt terms", () => {
    expect(classifyLineItem("Schokolade")).toEqual({
      category: "Snacks & Sweets",
      necessity: "discretionary"
    });
    expect(classifyLineItem("Pfandrückgabe")).toEqual({
      category: "Deposit/Pfand",
      necessity: "neutral"
    });
  });
});
