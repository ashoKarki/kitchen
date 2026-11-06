import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  isUnreceiptedPurchase,
  itemsForPurchaseCompletion,
  itemsForView,
  unreceiptedPurchaseItems
} from "../src/itemViews.js";
import type { KitchenItem } from "../src/types.js";

const item = (state: KitchenItem["state"]): KitchenItem => ({
  name: state,
  quantity: 1,
  category: "Groceries",
  state,
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0)
});

describe("itemsForView", () => {
  it("shows in-stock and finished items in the pantry", () => {
    const items = [
      { id: "stock", item: item("inStock") },
      { id: "finished", item: item("finished") },
      { id: "buy", item: item("toBuy") }
    ];
    expect(itemsForView(items, "pantry").map(({ id }) => id)).toEqual(["stock", "finished"]);
  });

  it("shows finished and to-buy items on the shopping list", () => {
    const items = [
      { id: "finished", item: item("finished") },
      { id: "buy", item: item("toBuy") },
      { id: "bought", item: { ...item("toBuy"), bought: true } },
      { id: "stock", item: item("inStock") }
    ];
    expect(itemsForView(items, "shopping").map(({ id }) => id)).toEqual(["finished", "buy", "bought"]);
  });

  it("keeps a completed purchase on the shopping list for up to 24 hours", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const justPurchased = {
      ...item("inStock"),
      bought: true,
      boughtAt: Timestamp.fromDate(new Date(now.getTime() - 23 * 60 * 60 * 1000))
    };
    const expired = {
      ...item("inStock"),
      bought: true,
      boughtAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    };
    const items = [
      { id: "recent", item: justPurchased },
      { id: "expired", item: expired },
      { id: "recorded", item: { ...justPurchased, receiptRecorded: true } }
    ];
    expect(itemsForView(items, "shopping", now).map(({ id }) => id)).toEqual(["recent"]);
  });
});

describe("isUnreceiptedPurchase", () => {
  it("allows checked legacy items without a purchase timestamp", () => {
    expect(isUnreceiptedPurchase({ bought: true, boughtAt: null, receiptRecorded: false })).toBe(true);
  });

  it("requires a checked, unrecorded purchase within 24 hours when timestamped", () => {
    const now = Date.now();
    expect(isUnreceiptedPurchase({
      bought: true,
      boughtAt: Timestamp.fromMillis(now - 60_000),
      receiptRecorded: false
    }, now)).toBe(true);
    expect(isUnreceiptedPurchase({
      bought: false,
      boughtAt: Timestamp.fromMillis(now - 60_000),
      receiptRecorded: false
    }, now)).toBe(false);
    expect(isUnreceiptedPurchase({
      bought: true,
      boughtAt: Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
      receiptRecorded: false
    }, now)).toBe(false);
    expect(isUnreceiptedPurchase({
      bought: true,
      boughtAt: Timestamp.fromMillis(now - 60_000),
      receiptRecorded: true
    }, now)).toBe(false);
  });
});

describe("unreceiptedPurchaseItems", () => {
  it("returns all pending purchases regardless of their individual purchase times", () => {
    const now = Date.now();
    const firstPurchase = Timestamp.fromMillis(now - 60_000);
    const secondPurchase = Timestamp.fromMillis(now - 30_000);
    const pending = unreceiptedPurchaseItems([
      { id: "milk", item: { ...item("inStock"), bought: true, boughtAt: firstPurchase } },
      { id: "bread", item: { ...item("inStock"), bought: true, boughtAt: firstPurchase } },
      { id: "eggs", item: { ...item("inStock"), bought: true, boughtAt: secondPurchase } },
      { id: "recorded", item: { ...item("inStock"), bought: true, boughtAt: secondPurchase, receiptRecorded: true } }
    ], now);

    expect(pending.map(({ id }) => id)).toEqual(["eggs", "milk", "bread"]);
  });
});

describe("itemsForPurchaseCompletion", () => {
  it("does not merge already completed purchases into a new shopping batch", () => {
    const items = [
      { id: "older-purchase", item: { ...item("inStock"), bought: true } },
      { id: "new-item", item: item("toBuy") },
      { id: "another-new-item", item: item("finished") }
    ];

    expect(itemsForPurchaseCompletion(items).map(({ id }) => id)).toEqual(["new-item", "another-new-item"]);
  });
});
