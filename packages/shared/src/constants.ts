import type { ExpenseCategory, KitchenSettings } from "./types.js";

export const KITCHEN_DOC_PATH = "kitchen/main";
export const KITCHEN_OWNER_EMAIL = "karkiashok5@gmail.com";

export const DEFAULT_DISCRETIONARY_CATEGORIES: readonly ExpenseCategory[] = [
  "Cafe & Eating out",
  "Snacks & Sweets",
  "Alcohol",
  "Tobacco"
];

export const DEFAULT_SETTINGS: KitchenSettings = {
  reminderEnabled: true,
  reminderHour: 9,
  timeZone: "UTC",
  budgetAlertsEnabled: true,
  discretionaryCategories: [...DEFAULT_DISCRETIONARY_CATEGORIES]
};
