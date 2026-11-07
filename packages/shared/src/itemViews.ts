import type { KitchenItem } from "./types.js";
import { quantityUnits } from "./quantity.js";

export type ItemView = "pantry" | "shopping";
const purchaseHoldMilliseconds = 24 * 60 * 60 * 1000;
export const itemUndoMilliseconds = 60_000;

export interface ItemWithId {
  id: string;
  item: KitchenItem;
}

export function stockWarning(item: Pick<KitchenItem, "quantity" | "stockBaseline">): "critical" | "low" | null {
  const baseline = item.stockBaseline ?? item.quantity;
  if (baseline === 0) return "critical";
  if (quantityUnits(item.quantity) * 10 < quantityUnits(baseline) * 3) return "critical";
  if (quantityUnits(item.quantity) * 2 < quantityUnits(baseline)) return "low";
  return null;
}

export function filterItemsByName(items: readonly ItemWithId[], search: string): ItemWithId[] {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(({ item }) => item.name.toLocaleLowerCase().includes(query));
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
    .filter(({ item }) => !item.deletedAt && isUnreceiptedPurchase(item, now))
    .sort((first, second) => (second.item.boughtAt?.toMillis() ?? 0) - (first.item.boughtAt?.toMillis() ?? 0));
}

export function itemsForPurchaseCompletion(items: readonly ItemWithId[]): ItemWithId[] {
  return items.filter(({ item }) => !item.deletedAt && item.state !== "inStock");
}

export function recentlyDeletedItems(items: readonly ItemWithId[], now = Date.now()): ItemWithId[] {
  return items.filter(({ item }) => item.deletedAt && now < item.deletedAt.toMillis() + itemUndoMilliseconds);
}

export function itemsForView(items: readonly ItemWithId[], view: ItemView, now = new Date()): ItemWithId[] {
  return items.filter(({ item }) => {
    if (item.deletedAt) return false;
    if (view === "pantry") return item.state !== "toBuy";
    if (item.state !== "inStock") return true;
    if (!item.bought || !item.boughtAt || item.receiptRecorded) return false;
    const elapsed = now.getTime() - item.boughtAt.toMillis();
    return elapsed >= 0 && elapsed < purchaseHoldMilliseconds;
  });
}
