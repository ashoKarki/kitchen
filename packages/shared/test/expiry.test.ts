import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { expiryDaysRemaining, expiryDescription, expiryWarnings, isValidExpiryDate } from "../src/expiry.js";
import type { ItemWithId } from "../src/itemViews.js";

describe("expiry dates", () => {
  it.each(["1900-01-01", "2000-02-29", "2024-02-29", "9999-12-31"])("accepts %s", (date) => {
    expect(isValidExpiryDate(date)).toBe(true);
  });
  it.each(["1899-12-31", "1900-02-29", "2023-02-29", "2024-04-31", "2024-13-01", "2024-1-01", ""])("rejects %s", (date) => {
    expect(isValidExpiryDate(date)).toBe(false);
  });
  it("uses calendar days rather than elapsed hours across daylight saving changes", () => {
    const now = new Date(2026, 2, 8, 23, 30);
    expect(expiryDaysRemaining("2026-03-09", now)).toBe(1);
    expect(expiryDescription("2026-03-08", now)).toBe("Expires today");
    expect(expiryDescription("2026-03-07", now)).toBe("Expired 1 day ago");
  });
  it("includes in-stock items within three days or overdue, but excludes other states", () => {
    const item = (id: string, expiryDate: string | null, state: "inStock" | "finished" | "toBuy", quantity = 1, deletedAt?: Timestamp): ItemWithId => ({
      id,
      item: { name: id, quantity, category: "Groceries", state, expiryDate, deletedAt, createdAt: new Timestamp(0, 0), updatedAt: new Timestamp(0, 0) }
    });
    const items = [
      item("three", "2026-11-14", "inStock"), item("four", "2026-11-15", "inStock"),
      item("expired", "2026-11-10", "inStock"), item("finished", "2026-11-11", "finished"),
      item("shopping", "2026-11-11", "toBuy"), item("empty", "2026-11-11", "inStock", 0),
      item("deleted", "2026-11-11", "inStock", 1, new Timestamp(0, 0)), item("none", null, "inStock")
    ];
    expect(expiryWarnings(items, new Date(2026, 10, 11, 12)).map(({ id }) => id)).toEqual(["expired", "three"]);
  });
});
