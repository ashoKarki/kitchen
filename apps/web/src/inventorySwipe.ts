const swipeThreshold = 100;
const swipeFriction = 2.5;
const maxVisualOffset = 88;

export function inventorySwipeOffset(deltaX: number): number {
  return Math.max(-maxVisualOffset, Math.min(maxVisualOffset, deltaX / swipeFriction));
}

export function inventorySwipeDirection(deltaX: number, deltaY: number): "left" | "right" | null {
  if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) <= Math.abs(deltaY)) return null;
  return deltaX < 0 ? "left" : "right";
}
