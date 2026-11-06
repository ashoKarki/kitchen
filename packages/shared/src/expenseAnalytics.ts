import { addDays, addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getPeriodBounds } from "./periods.js";
import type { BudgetPeriod, ExpenseCategory, PeriodBounds, Receipt } from "./types.js";

export type ExpensePeriod = "day" | BudgetPeriod;

export interface CategoryExpense {
  category: ExpenseCategory;
  amountCents: number;
}

export interface ExpenseSummary {
  receiptCount: number;
  totalCents: number;
  lineItemsTotalCents: number;
  categories: CategoryExpense[];
}

export function getExpensePeriodBounds(
  date: Date,
  period: ExpensePeriod,
  timeZone: string
): PeriodBounds {
  return getPeriodBounds(date, period, timeZone);
}

export function shiftExpensePeriod(date: Date, period: ExpensePeriod, amount: number): Date {
  if (!Number.isInteger(amount)) throw new RangeError("amount must be an integer");
  if (period === "day") return addDays(date, amount);
  if (period === "weekly") return addDays(date, amount * 7);
  return addMonths(date, amount);
}

export function getExpensePeriodLabel(
  date: Date,
  period: ExpensePeriod,
  timeZone: string
): string {
  const bounds = getPeriodBounds(date, period, timeZone);
  if (period === "monthly") return formatInTimeZone(bounds.start, timeZone, "MMMM yyyy");
  const end = new Date(bounds.endExclusive.getTime() - 1);
  const dateFormat = "d MMM yyyy";
  const startLabel = formatInTimeZone(bounds.start, timeZone, dateFormat);
  const endLabel = formatInTimeZone(end, timeZone, dateFormat);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function filterReceiptsByPeriod(
  receipts: readonly { id: string; receipt: Receipt }[],
  date: Date,
  period: ExpensePeriod,
  timeZone: string
): Array<{ id: string; receipt: Receipt }> {
  const bounds = getPeriodBounds(date, period, timeZone);
  const startDateKey = formatInTimeZone(bounds.start, timeZone, "yyyy-MM-dd");
  const endDateKey = formatInTimeZone(
    new Date(bounds.endExclusive.getTime() - 1),
    timeZone,
    "yyyy-MM-dd"
  );
  return receipts.filter(({ receipt }) => (
    receipt.purchaseDateKey >= startDateKey && receipt.purchaseDateKey <= endDateKey
  ));
}

export function summarizeExpenses(
  receipts: readonly { receipt: Receipt }[]
): ExpenseSummary {
  const categoryTotals = new Map<ExpenseCategory, number>();
  let totalCents = 0;
  let lineItemsTotalCents = 0;
  for (const { receipt } of receipts) {
    totalCents += receipt.totalCents;
    for (const line of receipt.lineItems) {
      lineItemsTotalCents += line.amountCents;
      categoryTotals.set(line.category, (categoryTotals.get(line.category) ?? 0) + line.amountCents);
    }
  }
  return {
    receiptCount: receipts.length,
    totalCents,
    lineItemsTotalCents,
    categories: [...categoryTotals]
      .map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents || a.category.localeCompare(b.category))
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function euroAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

export function receiptsToCsv(receipts: readonly { receipt: Receipt }[]): string {
  const rows: Array<Array<string | number>> = [[
    "purchase_date",
    "purchase_time",
    "store_name",
    "receipt_total_eur",
    "currency",
    "payment_method",
    "item_name",
    "raw_name",
    "quantity",
    "item_amount_eur",
    "category",
    "necessity",
    "is_deposit",
    "source"
  ]];

  for (const { receipt } of receipts) {
    const lines = receipt.lineItems.length > 0 ? receipt.lineItems : [null];
    for (const line of lines) {
      rows.push([
        receipt.purchaseDateKey,
        receipt.purchaseTime ?? "",
        receipt.storeName,
        euroAmount(receipt.totalCents),
        receipt.currency,
        receipt.paymentMethod ?? "",
        line?.name ?? "",
        line?.rawName ?? "",
        line?.quantity ?? "",
        line ? euroAmount(line.amountCents) : "",
        line?.category ?? "",
        line?.necessity ?? "",
        line?.isDeposit ? "true" : line ? "false" : "",
        receipt.source
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
