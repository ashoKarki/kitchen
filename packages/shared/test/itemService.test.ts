import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  collection: vi.fn(() => "collection"),
  doc: vi.fn(() => "item-ref"),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time")
}));

vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp
}));

import { setActiveKitchenId } from "../src/constants.js";
import { adjustItemQuantity, setItemBought } from "../src/itemService.js";
import type { Firestore } from "firebase/firestore";

const db = {} as Firestore;

describe("setItemBought", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveKitchenId("household");
    mocks.get.mockResolvedValue({
      exists: () => true,
      get: (field: string) => field === "quantity" ? 0 : undefined
    });
    mocks.runTransaction.mockImplementation(async (_db, callback: (transaction: unknown) => Promise<void>) =>
      callback({ get: mocks.get, update: mocks.update }));
  });

  it("moves each purchase to the pantry and replenishes zero stock", async () => {
    await setItemBought(db, "item", true);
    expect(mocks.update).toHaveBeenCalledWith("item-ref", {
      state: "inStock", quantity: 1, stockBaseline: 1, bought: true, boughtAt: "server-time",
      receiptRecorded: false, updatedAt: "server-time"
    });

  });

  it("moves an unchecked purchase back to the shopping list", async () => {
    await setItemBought(db, "item", false);
    expect(mocks.update).toHaveBeenCalledWith("item-ref", {
      state: "toBuy", bought: false, boughtAt: null, receiptRecorded: false, updatedAt: "server-time"
    });
  });

  it("preserves a fractional purchased quantity as the baseline", async () => {
    mocks.get.mockResolvedValue({ exists: () => true, get: (field: string) => field === "quantity" ? 0.5 : undefined });
    await setItemBought(db, "item", true);
    expect(mocks.update).toHaveBeenCalledWith("item-ref", {
      state: "inStock", stockBaseline: 0.5, bought: true, boughtAt: "server-time",
      receiptRecorded: false, updatedAt: "server-time"
    });
  });

  it("rejects deleted items", async () => {
    mocks.get.mockResolvedValue({ exists: () => true, get: (field: string) => field === "deletedAt" ? "deleted" : 1 });
    await expect(setItemBought(db, "item", true)).rejects.toThrow("This item has been deleted.");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("adjustItemQuantity", () => {
  function snapshot(quantity: number, stockBaseline?: number, state = "inStock") {
    return {
      exists: () => true,
      get: (field: string) => ({ quantity, stockBaseline, state })[field as "quantity" | "stockBaseline" | "state"]
    };
  }
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveKitchenId("household");
    mocks.runTransaction.mockImplementation(async (_db, callback: (transaction: unknown) => Promise<void>) =>
      callback({ get: mocks.get, update: mocks.update }));
  });

  it("subtracts stock and preserves the initial legacy balance as baseline", async () => {
    mocks.get.mockResolvedValue(snapshot(10));
    await adjustItemQuantity(db, "item", -2);
    expect(mocks.update).toHaveBeenCalledWith("item-ref", {
      quantity: 8, stockBaseline: 10, state: "inStock", updatedAt: "server-time"
    });
  });

  it("resets the baseline to the new total when adding stock", async () => {
    mocks.get.mockResolvedValue(snapshot(3, 10));
    await adjustItemQuantity(db, "item", 5);
    expect(mocks.update).toHaveBeenCalledWith("item-ref", {
      quantity: 8, stockBaseline: 8, state: "inStock", updatedAt: "server-time"
    });
  });

  it("marks zero stock finished and rejects overdrawing", async () => {
    mocks.get.mockResolvedValue(snapshot(2, 10));
    await adjustItemQuantity(db, "item", -2);
    expect(mocks.update).toHaveBeenCalledWith("item-ref", {
      quantity: 0, stockBaseline: 10, state: "finished", updatedAt: "server-time"
    });
    mocks.update.mockClear();
    await expect(adjustItemQuantity(db, "item", -3)).rejects.toThrow("Cannot subtract more");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("subtracts consecutive portions exactly and marks the remainder finished", async () => {
    mocks.get.mockResolvedValue(snapshot(1));
    await adjustItemQuantity(db, "item", -0.5);
    expect(mocks.update).toHaveBeenLastCalledWith("item-ref", {
      quantity: 0.5, stockBaseline: 1, state: "inStock", updatedAt: "server-time"
    });
    mocks.get.mockResolvedValue(snapshot(0.5, 1));
    await adjustItemQuantity(db, "item", -0.25);
    expect(mocks.update).toHaveBeenLastCalledWith("item-ref", {
      quantity: 0.25, stockBaseline: 1, state: "inStock", updatedAt: "server-time"
    });
    mocks.get.mockResolvedValue(snapshot(0.25, 1));
    await adjustItemQuantity(db, "item", -0.25);
    expect(mocks.update).toHaveBeenLastCalledWith("item-ref", {
      quantity: 0, stockBaseline: 1, state: "finished", updatedAt: "server-time"
    });
  });

  it("avoids floating point drift and rejects overdrawing small fractions", async () => {
    mocks.get.mockResolvedValue(snapshot(0.3, 0.3));
    await adjustItemQuantity(db, "item", -0.2);
    expect(mocks.update).toHaveBeenLastCalledWith("item-ref", {
      quantity: 0.1, stockBaseline: 0.3, state: "inStock", updatedAt: "server-time"
    });
    mocks.get.mockResolvedValue(snapshot(0.1, 0.3));
    await expect(adjustItemQuantity(db, "item", -0.100000001)).rejects.toThrow("Cannot subtract more");
    await adjustItemQuantity(db, "item", 0.2);
    expect(mocks.update).toHaveBeenLastCalledWith("item-ref", {
      quantity: 0.3, stockBaseline: 0.3, state: "inStock", updatedAt: "server-time"
    });
  });

  it("rejects excess precision, zero, and quantities over the limit", async () => {
    await expect(adjustItemQuantity(db, "item", 0.0000000001)).rejects.toThrow("at most 9 decimal places");
    await expect(adjustItemQuantity(db, "item", 0)).rejects.toThrow("above 0");
    mocks.get.mockResolvedValue(snapshot(9999));
    await expect(adjustItemQuantity(db, "item", 0.000000001)).rejects.toThrow("cannot exceed 9999");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
