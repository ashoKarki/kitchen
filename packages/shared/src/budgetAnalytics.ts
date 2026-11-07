import { formatInTimeZone } from "date-fns-tz";
import { getPeriodBounds } from "./periods.js";
import type {
  BudgetDraft,
  BudgetScope,
  ExpenseCategory,
  PeriodBounds,
  ReceiptLineItem
} from "./types.js";

export type BudgetSpendReceipt = {
  totalCents: number;
  lineItems: readonly Pick<ReceiptLineItem, "amountCents" | "category" | "necessity">[];
};

export function getBudgetPeriodBounds(
  date: Date,
  period: BudgetDraft["period"],
  timeZone: string
): PeriodBounds {
  return getPeriodBounds(date, period, timeZone);
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

export function budgetScopeLabel(scope: BudgetScope): string {
  if (scope.type === "overall") return "All spending";
  if (scope.type === "discretionary") return "Discretionary";
  return scope.categories.join(", ");
}

export function getBudgetSpendCents(
  receipts: readonly BudgetSpendReceipt[],
  scope: BudgetScope,
  discretionaryCategories: readonly ExpenseCategory[]
): number {
  const categories = scope.type === "categories"
    ? new Set(scope.categories)
    : scope.type === "discretionary"
      ? new Set(discretionaryCategories)
      : null;
  if (scope.type === "overall") {
    return receipts.reduce((sum, receipt) => sum + receipt.totalCents, 0);
  }
  return receipts.reduce((sum, receipt) => sum + receipt.lineItems.reduce(
    (lineTotal, line) => lineTotal + (
      categories?.has(line.category) ? line.amountCents : 0
    ),
    0
  ), 0);
}

export function getHighestReachedBudgetThreshold(
  spentCents: number,
  budgetCents: number
): number | null {
  if (!Number.isSafeInteger(spentCents) || !Number.isSafeInteger(budgetCents) || budgetCents <= 0) {
    throw new RangeError("Budget amounts must be safe integer cents and the budget must be positive.");
  }
  const scaledSpent = BigInt(spentCents) * 100n;
  const budget = BigInt(budgetCents);
  if (scaledSpent >= budget * 100n) {
    const threshold = 100n + ((scaledSpent - budget * 100n) / (budget * 10n)) * 10n;
    if (threshold > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("Reached budget threshold exceeds the safe integer range.");
    }
    return Number(threshold);
  }

  const fixedThresholds = [98, 96, 94, 92, 90, 80, 70] as const;
  for (const threshold of fixedThresholds) {
    if (scaledSpent >= budget * BigInt(threshold)) return threshold;
  }
  return null;
}
