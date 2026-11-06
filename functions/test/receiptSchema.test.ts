import { describe, expect, it } from "vitest";
import { classifyReceiptLines, parsedReceiptSchema } from "../src/receiptSchema.js";

const germanReceipt = {
  storeName: "EDEKA",
  purchaseDateKey: "2026-10-28",
  purchaseTime: "17:42",
  totalCents: 447,
  paymentMethod: "card",
  lineItems: [
    {
      rawName: "VOLLMILCH 3,8%",
      name: "Vollmilch",
      quantity: 1,
      amountCents: 129,
      category: null,
      necessity: null
    },
    {
      rawName: "PFAND",
      name: "Pfand",
      quantity: 1,
      amountCents: 25,
      category: null,
      necessity: null,
      isDeposit: true
    },
    {
      rawName: "RABATT",
      name: "Rabatt",
      quantity: 1,
      amountCents: -7,
      category: null,
      necessity: "neutral"
    }
  ],
  confidence: 0.94,
  warnings: []
};

const billaReceipt = {
  storeName: "BILLA",
  purchaseDateKey: "2026-11-06",
  purchaseTime: "20:28",
  totalCents: 493,
  paymentMethod: "card",
  lineItems: [
    {
      rawName: "IC Monster Energy Green",
      name: "Monster Energy Green",
      quantity: 1,
      amountCents: 169,
      category: "Beverages",
      necessity: "neutral"
    },
    {
      rawName: "PFANDARTIKEL",
      name: "Pfand",
      quantity: 1,
      amountCents: 25,
      category: "Deposit/Pfand",
      necessity: "neutral",
      isDeposit: true
    },
    {
      rawName: "Happy Day Rote Traube",
      name: "Rote Traube",
      quantity: 1,
      amountCents: 299,
      category: "Beverages",
      necessity: "neutral"
    }
  ],
  confidence: 0.96,
  warnings: []
};

describe("parsedReceiptSchema", () => {
  it("accepts integer cents and German receipt date/time fields", () => {
    expect(parsedReceiptSchema.parse(germanReceipt)).toMatchObject({
      storeName: "EDEKA",
      purchaseDateKey: "2026-10-28",
      totalCents: 447
    });
  });

  it("rejects impossible dates, invalid times, and fractional euro-cent values", () => {
    expect(parsedReceiptSchema.safeParse({
      ...germanReceipt,
      purchaseDateKey: "2026-02-30"
    }).success).toBe(false);
    expect(parsedReceiptSchema.safeParse({
      ...germanReceipt,
      purchaseTime: "29:82"
    }).success).toBe(false);
    expect(parsedReceiptSchema.safeParse({
      ...germanReceipt,
      totalCents: 4.47
    }).success).toBe(false);
  });

  it("accepts the German BILLA receipt details from the provided photo", () => {
    const receipt = parsedReceiptSchema.parse(billaReceipt);
    const classified = classifyReceiptLines(receipt, []);

    expect(classified.lineItems.reduce((sum, item) => sum + item.amountCents, 0)).toBe(493);
    expect(classified.lineItems[1]).toMatchObject({
      name: "Pfand",
      category: "Deposit/Pfand",
      amountCents: 25,
      isDeposit: true
    });
    expect(classified.warnings).toEqual([]);
  });
});

describe("classifyReceiptLines", () => {
  it("applies German keyword fallbacks and warns when item sums do not reconcile", () => {
    const receipt = parsedReceiptSchema.parse(germanReceipt);
    const result = classifyReceiptLines(receipt, [
      "Cafe & Eating out",
      "Snacks & Sweets",
      "Alcohol",
      "Tobacco"
    ]);

    expect(result.lineItems.map(({ category }) => category)).toEqual([
      "Groceries",
      "Deposit/Pfand",
      "Groceries"
    ]);
    expect(result.lineItems[0]?.necessity).toBe("essential");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("differs from receipt total");
  });

  it("does not warn when receipt and lines differ by at most two cents", () => {
    const balanced = parsedReceiptSchema.parse({
      ...germanReceipt,
      totalCents: 148,
      lineItems: [
        { rawName: "Milch", name: "Milch", quantity: 1, amountCents: 149, category: "Groceries" }
      ]
    });
    expect(classifyReceiptLines(balanced, ["Cafe & Eating out"]).warnings).toEqual([]);
  });
});
