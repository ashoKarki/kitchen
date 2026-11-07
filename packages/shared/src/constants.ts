import type { ExpenseCategory, KitchenSettings } from "./types.js";

export const DEFAULT_DISCRETIONARY_CATEGORIES: readonly ExpenseCategory[] = [
  "Cafe & Eating out",
  "Snacks & Sweets",
  "Alcohol",
  "Tobacco"
];

let activeKitchenId: string | null = null;
const kitchenIdListeners = new Set<() => void>();

export function getActiveKitchenId(): string | null {
  return activeKitchenId;
}

export function getKitchenDocPath(): string {
  if (!activeKitchenId) throw new Error("A signed-in household is required.");
  return `kitchen/${activeKitchenId}`;
}

export function setActiveKitchenId(kitchenId: string | null): void {
  if (kitchenId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(kitchenId)) {
    throw new Error("The household identifier is invalid.");
  }
  if (activeKitchenId === kitchenId) return;
  activeKitchenId = kitchenId;
  for (const listener of kitchenIdListeners) listener();
}

export function subscribeToActiveKitchenId(listener: () => void): () => void {
  kitchenIdListeners.add(listener);
  return () => kitchenIdListeners.delete(listener);
}

export const DEFAULT_SETTINGS: KitchenSettings = {
  reminderEnabled: true,
  reminderHour: 9,
  timeZone: "UTC",
  budgetAlertsEnabled: true,
  discretionaryCategories: [...DEFAULT_DISCRETIONARY_CATEGORIES]
};
