import { z } from "zod";
import {
  classifyLineItem,
  defaultNecessityForCategory
} from "../../packages/shared/src/classify.js";
import {
  expenseCategories,
  type ExpenseCategory,
  type ExpenseNecessity,
  type ReceiptLineItem
} from "../../packages/shared/src/types.js";

const lineSchema = z.object({
  rawName: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(9999),
  amountCents: z.number().int().safe(),
  category: z.enum(expenseCategories).nullable(),
  necessity: z.enum(["essential", "discretionary", "neutral"]).nullable().optional(),
  isDeposit: z.boolean().optional()
});

export const parsedReceiptSchema = z.object({
  storeName: z.string().min(1).max(100),
  purchaseDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchaseTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  totalCents: z.number().int().safe(),
  paymentMethod: z.enum(["cash", "card", "other"]).optional(),
  lineItems: z.array(lineSchema).max(200),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(500)).max(30)
}).superRefine((receipt, context) => {
  const [yearText, monthText, dayText] = receipt.purchaseDateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["purchaseDateKey"], message: "Invalid calendar date." });
  }
  if (receipt.purchaseTime) {
    const [hour, minute] = receipt.purchaseTime.split(":").map(Number);
    if (hour === undefined || hour > 23 || minute === undefined || minute > 59) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["purchaseTime"], message: "Invalid time." });
    }
  }
});

export type ParsedReceipt = z.infer<typeof parsedReceiptSchema>;

export interface ClassifiedReceipt extends Omit<ParsedReceipt, "lineItems"> {
  lineItems: ReceiptLineItem[];
}

export function classifyReceiptLines(
  parsed: ParsedReceipt,
  discretionaryCategories: readonly ExpenseCategory[]
): ClassifiedReceipt {
  const warnings = [...parsed.warnings];
  const lineItems: ReceiptLineItem[] = parsed.lineItems.map((line) => {
    const fallback = classifyLineItem(line.name, discretionaryCategories);
    const category = line.category ?? fallback.category;
    const necessity: ExpenseNecessity = line.necessity
      ?? defaultNecessityForCategory(category, discretionaryCategories);
    return {
      rawName: line.rawName,
      name: line.name,
      quantity: line.quantity,
      amountCents: line.amountCents,
      category,
      necessity,
      ...(line.isDeposit === undefined ? {} : { isDeposit: line.isDeposit })
    };
  });
  const lineTotalCents = lineItems.reduce((sum, line) => sum + line.amountCents, 0);
  if (Math.abs(lineTotalCents - parsed.totalCents) > 2) {
    warnings.push(`Line items total ${lineTotalCents} cents, which differs from receipt total ${parsed.totalCents} cents.`);
  }
  return { ...parsed, lineItems, warnings };
}
