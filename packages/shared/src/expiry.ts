import type { ItemWithId } from "./itemViews.js";
import type { KitchenItem } from "./types.js";

export const expiryWarningDays = 3;
export type ExpiryWarning = ItemWithId & { item: KitchenItem & { expiryDate: string } };

export function isValidExpiryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function expiryDaysRemaining(expiryDate: string, now = new Date()): number {
  if (!isValidExpiryDate(expiryDate)) throw new Error("Invalid expiry date.");
  const today = localDateKey(now);
  return (Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
}

export function expiryDescription(expiryDate: string, now = new Date()): string {
  const days = expiryDaysRemaining(expiryDate, now);
  if (days < 0) return `Expired ${-days} ${days === -1 ? "day" : "days"} ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export function expiryWarnings(items: readonly ItemWithId[], now = new Date()): ExpiryWarning[] {
  return items.filter((entry): entry is ExpiryWarning => {
    const item = entry.item;
    return item.state === "inStock" && item.quantity > 0 && !item.deletedAt
      && item.expiryDate != null && expiryDaysRemaining(item.expiryDate, now) <= expiryWarningDays;
  }).sort((a, b) => a.item.expiryDate.localeCompare(b.item.expiryDate));
}
