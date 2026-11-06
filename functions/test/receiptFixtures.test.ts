import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expenseCategories } from "../../packages/shared/src/types.js";
import { classifyReceiptLines, parsedReceiptSchema } from "../src/receiptSchema.js";

const fixtures = JSON.parse(
  readFileSync(new URL("../../packages/shared/test/fixtures/receipts.de.json", import.meta.url), "utf8")
);

describe("German receipt fixtures", () => {
  it("pass receipt parsing and line-total reconciliation", () => {
    for (const fixture of fixtures) {
      const parsed = parsedReceiptSchema.parse({
        ...fixture,
        confidence: 1,
        warnings: []
      });
      const classified = classifyReceiptLines(parsed, expenseCategories);

      expect(classified.lineItems.reduce((sum, item) => sum + item.amountCents, 0))
        .toBe(classified.totalCents);
      expect(classified.warnings).toEqual([]);
    }
  });
});
