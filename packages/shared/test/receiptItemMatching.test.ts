import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { matchingReceiptItems } from "../src/receiptItemMatching.js";
import type { ItemWithId } from "../src/itemViews.js";

function item(id: string, name: string, deleted = false): ItemWithId {
  const timestamp = Timestamp.fromMillis(0);
  return {
    id,
    item: {
      name, quantity: 1, category: "Groceries", state: "inStock",
      createdAt: timestamp, updatedAt: timestamp,
      ...(deleted ? { deletedAt: timestamp } : {})
    }
  };
}

const line = { name: "Whole Milk", amountCents: 120, category: "Groceries" as const };

describe("matchingReceiptItems", () => {
  it("suggests matching household names irrespective of case, punctuation or a qualifying word", () => {
    const items = [item("milk", "milk"), item("whole", "Whole-milk"), item("milkshake", "Milkshake")];
    expect(matchingReceiptItems(line, items).map(({ id }) => id)).toEqual(["milk", "whole"]);
  });

  it("matches simple plural forms and supports names in either direction", () => {
    expect(matchingReceiptItems({ ...line, name: "Apples" }, [item("apple", "Apple")]).map(({ id }) => id)).toEqual(["apple"]);
    expect(matchingReceiptItems({ ...line, name: "Milk" }, [item("oat", "Oat Milk")]).map(({ id }) => id)).toEqual(["oat"]);
  });

  it("does not suggest deleted items, tiny names, deposits, or negative lines", () => {
    const items = [item("deleted", "Milk", true), item("short", "a")];
    expect(matchingReceiptItems(line, items)).toEqual([]);
    expect(matchingReceiptItems({ ...line, name: "a" }, [item("a", "a")])).toEqual([]);
    expect(matchingReceiptItems({ ...line, isDeposit: true }, [item("milk", "milk")])).toEqual([]);
    expect(matchingReceiptItems({ ...line, category: "Deposit/Pfand" }, [item("milk", "milk")])).toEqual([]);
    expect(matchingReceiptItems({ ...line, amountCents: -1 }, [item("milk", "milk")])).toEqual([]);
  });

  it("limits suggestions without changing household items", () => {
    const items = Array.from({ length: 7 }, (_, index) => item(String(index), "Milk"));
    expect(matchingReceiptItems(line, items)).toHaveLength(5);
    expect(items).toHaveLength(7);
    expect(items[0]?.item.name).toBe("Milk");
  });
});
