import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

const mocks = vi.hoisted(() => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "timestamp")
}));
vi.mock("firebase/firestore", () => mocks);

import { saveVoiceShoppingItem } from "./saveVoiceShoppingItem";

describe("saving a Siri shopping item", () => {
  const db = {} as Firestore;
  const item = { id: "request-1", name: "Apples", quantity: 3 };
  const ref = { path: "item" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.doc.mockReturnValue(ref);
  });

  it("writes the requested quantity and Groceries category to a stable household document", async () => {
    const transaction = { get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn() };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));
    await saveVoiceShoppingItem(db, "home", item);
    expect(mocks.doc).toHaveBeenCalledWith(db, "kitchen", "home", "items", "siri_request-1");
    expect(transaction.set).toHaveBeenCalledWith(ref, {
      name: "Apples", quantity: 3, category: "Groceries", state: "toBuy",
      createdAt: "timestamp", updatedAt: "timestamp"
    });
  });

  it("does not overwrite an existing item when the same request is retried", async () => {
    const transaction = { get: vi.fn().mockResolvedValue({ exists: () => true }), set: vi.fn() };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));
    await saveVoiceShoppingItem(db, "home", item);
    expect(transaction.set).not.toHaveBeenCalled();
  });
});
