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

export function getReachedBudgetThresholds(
  spentCents: number,
  budgetCents: number
): Array<80 | 100> {
  if (!Number.isSafeInteger(spentCents) || !Number.isSafeInteger(budgetCents) || budgetCents <= 0) {
    throw new RangeError("Budget amounts must be safe integer cents and the budget must be positive.");
  }
  const reached: Array<80 | 100> = [];
  if (BigInt(spentCents) * 100n >= BigInt(budgetCents) * 80n) reached.push(80);
  if (spentCents >= budgetCents) reached.push(100);
  return reached;
}
