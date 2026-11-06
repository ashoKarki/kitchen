import type { Timestamp } from "firebase/firestore";

export const expenseCategories = [
  "Groceries",
  "Beverages",
  "Cafe & Eating out",
  "Snacks & Sweets",
  "Alcohol",
  "Tobacco",
  "Household",
  "Drugstore & Personal care",
  "Deposit/Pfand",
  "Other"
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export type ItemState = "inStock" | "finished" | "toBuy";
export type BudgetPeriod = "weekly" | "monthly";

export type BudgetScope =
  | { type: "overall" }
  | { type: "categories"; categories: ExpenseCategory[] }
  | { type: "discretionary" };

export interface BudgetDraft {
  name: string;
  period: BudgetPeriod;
  amountCents: number;
  scope: BudgetScope;
  active: boolean;
}

export interface Budget extends BudgetDraft {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  alertState?: {
    periodKey: string;
    sentThresholds: number[];
  } | undefined;
}

export interface BudgetAlert {
  budgetId: string;
  budgetName: string;
  period: BudgetPeriod;
  periodKey: string;
  thresholdPercent: number;
  amountCents: number;
  spentCents: number;
  read: boolean;
  createdAt: Timestamp;
}

export interface KitchenSettings {
  reminderEnabled: boolean;
  reminderHour: number;
  timeZone: string;
  budgetAlertsEnabled: boolean;
  discretionaryCategories: ExpenseCategory[];
}

export interface PeriodBounds {
  key: string;
  start: Date;
  endExclusive: Date;
}

export interface KitchenItem {
  name: string;
  quantity: number;
  category: ExpenseCategory;
  state: ItemState;
  bought?: boolean;
  boughtAt?: Timestamp | null;
  receiptRecorded?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NewKitchenItem = Pick<KitchenItem, "name" | "quantity" | "category" | "state">;

export interface KitchenItemUpdate {
  name?: string;
  quantity?: number;
  category?: ExpenseCategory;
  state?: ItemState;
  bought?: boolean;
  boughtAt?: Timestamp | null;
  receiptRecorded?: boolean;
}

export type ExpenseNecessity = "essential" | "discretionary" | "neutral";
export type ReceiptSource = "scan" | "manual";
export type PaymentMethod = "cash" | "card" | "other";

export interface ReceiptLineItem {
  rawName: string;
  name: string;
  quantity: number;
  amountCents: number;
  category: ExpenseCategory;
  necessity: ExpenseNecessity;
  isDeposit?: boolean | undefined;
}

export interface ReceiptDraft {
  source: ReceiptSource;
  storeName: string;
  purchaseDateKey: string;
  purchaseTime?: string | undefined;
  totalCents: number;
  currency: "EUR";
  paymentMethod?: PaymentMethod | undefined;
  lineItems: ReceiptLineItem[];
  dedupeHash: string;
}

export interface Receipt extends ReceiptDraft {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ScannedReceipt extends Omit<ReceiptDraft, "source" | "currency" | "dedupeHash"> {
  confidence: number;
  warnings: string[];
}
