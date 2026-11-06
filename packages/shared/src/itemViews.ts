import type { KitchenItem } from "./types.js";

export type ItemView = "pantry" | "shopping";
const purchaseHoldMilliseconds = 24 * 60 * 60 * 1000;

export interface ItemWithId {
  id: string;
  item: KitchenItem;
}

export function isUnreceiptedPurchase(
  item: Pick<KitchenItem, "bought" | "boughtAt" | "receiptRecorded">,
  now = Date.now()
): boolean {
  if (item.bought !== true || item.receiptRecorded) return false;
  if (!item.boughtAt) return true;
  const elapsed = now - item.boughtAt.toMillis();
  return elapsed >= 0 && elapsed < purchaseHoldMilliseconds;
}

export function unreceiptedPurchaseItems(
  items: readonly ItemWithId[],
  now = Date.now()
): ItemWithId[] {
  return items
    .filter(({ item }) => isUnreceiptedPurchase(item, now))
    .sort((first, second) => (second.item.boughtAt?.toMillis() ?? 0) - (first.item.boughtAt?.toMillis() ?? 0));
}

export function itemsForPurchaseCompletion(items: readonly ItemWithId[]): ItemWithId[] {
  return items.filter(({ item }) => item.state !== "inStock");
}

export function itemsForView(items: readonly ItemWithId[], view: ItemView, now = new Date()): ItemWithId[] {
  return items.filter(({ item }) => {
    if (view === "pantry") return item.state !== "toBuy";
    if (item.state !== "inStock") return true;
    if (!item.bought || !item.boughtAt || item.receiptRecorded) return false;
    const elapsed = now.getTime() - item.boughtAt.toMillis();
    return elapsed >= 0 && elapsed < purchaseHoldMilliseconds;
  });
}
