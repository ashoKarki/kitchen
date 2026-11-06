import { subMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { filterReceiptsByPeriod, summarizeExpenses } from "./expenseAnalytics.js";
import { getBudgetPeriodBounds, getBudgetSpendCents } from "./budgetAnalytics.js";
import type {
  Budget,
  ExpenseCategory,
  Receipt
} from "./types.js";

export interface InsightMessage {
  id: string;
  title: string;
  detail: string;
  kind: "positive" | "neutral" | "warning";
}

export interface InsightAggregate {
  currentPeriod: { label: string; receiptCount: number; totalCents: number };
  previousPeriod: { label: string; receiptCount: number; totalCents: number };
  categoryTotals: Array<{ category: ExpenseCategory; amountCents: number }>;
  discretionaryCents: number;
  discretionarySharePercent: number;
}

export interface SpendingInsightReport {
  aggregate: InsightAggregate;
  messages: InsightMessage[];
}

export interface AiInsightContext extends InsightAggregate {
  budgetSummaries: Array<{
    name: string;
    period: "weekly" | "monthly";
    amountCents: number;
    spentCents: number;
  }>;
}

function monthLabel(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "MMMM yyyy");
}

export function buildSpendingInsightReport(
  receipts: readonly { id: string; receipt: Receipt }[],
  now: Date,
  timeZone: string,
  discretionaryCategories: readonly ExpenseCategory[],
  budgets: readonly { budget: Budget }[] = []
): { report: SpendingInsightReport; aiContext: AiInsightContext } {
  const currentReceipts = filterReceiptsByPeriod(receipts, now, "monthly", timeZone);
  const previousDate = subMonths(now, 1);
  const previousReceipts = filterReceiptsByPeriod(receipts, previousDate, "monthly", timeZone);
  const currentSummary = summarizeExpenses(currentReceipts);
  const previousSummary = summarizeExpenses(previousReceipts);
  const discretionarySet = new Set(discretionaryCategories);
  const discretionaryCents = currentReceipts.reduce((total, { receipt }) => (
    total + receipt.lineItems.reduce((sum, line) => (
      sum + (line.necessity === "discretionary" || discretionarySet.has(line.category) ? line.amountCents : 0)
    ), 0)
  ), 0);
  const discretionarySharePercent = currentSummary.lineItemsTotalCents > 0
    ? Math.round(discretionaryCents / currentSummary.lineItemsTotalCents * 100)
    : 0;
  const aggregate: InsightAggregate = {
    currentPeriod: {
      label: monthLabel(now, timeZone),
      receiptCount: currentSummary.receiptCount,
      totalCents: currentSummary.totalCents
    },
    previousPeriod: {
      label: monthLabel(previousDate, timeZone),
      receiptCount: previousSummary.receiptCount,
      totalCents: previousSummary.totalCents
    },
    categoryTotals: currentSummary.categories,
    discretionaryCents,
    discretionarySharePercent
  };
  const messages: InsightMessage[] = [];
  if (previousSummary.receiptCount > 0) {
    const changeCents = currentSummary.totalCents - previousSummary.totalCents;
    const changePercent = previousSummary.totalCents === 0
      ? null
      : Math.round(Math.abs(changeCents) / Math.abs(previousSummary.totalCents) * 100);
    messages.push({
      id: "month-over-month",
      title: changeCents > 0 ? "Spending is up" : changeCents < 0 ? "Spending is down" : "Spending is unchanged",
      detail: `${formatSignedCents(changeCents)}${changePercent === null ? "" : ` (${changePercent}%)`} compared with ${previousSummary.totalCents === 0 ? "no previous spending" : aggregate.previousPeriod.label}.`,
      kind: changeCents > 0 ? "warning" : changeCents < 0 ? "positive" : "neutral"
    });
  } else if (currentSummary.receiptCount > 0) {
    messages.push({
      id: "first-month",
      title: "Your spending baseline is taking shape",
      detail: `${currentSummary.receiptCount} ${currentSummary.receiptCount === 1 ? "receipt" : "receipts"} recorded in ${aggregate.currentPeriod.label}. Add activity in another month to see a comparison.`,
      kind: "neutral"
    });
  }
  const topCategory = currentSummary.categories[0];
  if (topCategory) {
    messages.push({
      id: "top-category",
      title: "Largest category this month",
      detail: `${topCategory.category} accounts for ${formatCents(topCategory.amountCents)} in recorded line items.`,
      kind: "neutral"
    });
  }
  if (currentSummary.lineItemsTotalCents > 0) {
    messages.push({
      id: "discretionary-share",
      title: "Discretionary spending",
      detail: `${formatCents(discretionaryCents)} (${discretionarySharePercent}%) of categorized line-item spending is discretionary.`,
      kind: discretionarySharePercent >= 50 ? "warning" : "neutral"
    });
  }

  const budgetSummaries = budgets.filter(({ budget }) => budget.active).map(({ budget }) => {
    const bounds = getBudgetPeriodBounds(now, budget.period, timeZone);
    const periodReceipts = filterReceiptsByPeriod(receipts, bounds.start, budget.period, timeZone)
      .map(({ receipt }) => receipt);
    return {
      name: budget.name,
      period: budget.period,
      amountCents: budget.amountCents,
      spentCents: getBudgetSpendCents(periodReceipts, budget.scope, discretionaryCategories)
    };
  });
  for (const budget of budgetSummaries) {
    const progress = budget.spentCents / budget.amountCents;
    if (progress >= 0.8) {
      messages.push({
        id: `budget-${budget.name}`,
        title: progress >= 1 ? `${budget.name} is over budget` : `${budget.name} is nearing its limit`,
        detail: `${formatCents(budget.spentCents)} of ${formatCents(budget.amountCents)} used this ${budget.period === "weekly" ? "week" : "month"}.`,
        kind: progress >= 1 ? "warning" : "neutral"
      });
    }
  }

  return {
    report: { aggregate, messages },
    aiContext: { ...aggregate, budgetSummaries }
  };
}

function formatCents(amountCents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amountCents / 100);
}

function formatSignedCents(amountCents: number): string {
  if (amountCents > 0) return `+${formatCents(amountCents)}`;
  if (amountCents < 0) return `−${formatCents(Math.abs(amountCents))}`;
  return formatCents(0);
}

