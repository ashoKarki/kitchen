import { describe, expect, it } from "vitest";
import { inventorySwipeDirection, inventorySwipeOffset } from "./inventorySwipe";

describe("inventory swipes", () => {
  it("requires a deliberate horizontal swipe in either direction", () => {
    expect(inventorySwipeDirection(99, 0)).toBeNull();
    expect(inventorySwipeDirection(100, 100)).toBeNull();
    expect(inventorySwipeDirection(100, 20)).toBe("right");
    expect(inventorySwipeDirection(-100, 20)).toBe("left");
  });

  it("resists movement and caps the visual offset", () => {
    expect(inventorySwipeOffset(100)).toBe(40);
    expect(inventorySwipeOffset(-100)).toBe(-40);
    expect(inventorySwipeOffset(300)).toBe(88);
    expect(inventorySwipeOffset(-300)).toBe(-88);
  });
});
