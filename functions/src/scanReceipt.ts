import Anthropic, { type APIError } from "@anthropic-ai/sdk";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  expenseCategories,
  type ExpenseCategory
} from "../../packages/shared/src/types.js";
import { requireMember } from "./auth.js";
import { enforceAppCheck } from "./household.js";
import {
  classifyReceiptLines,
  parsedReceiptSchema
} from "./receiptSchema.js";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const anthropicModel = defineString("ANTHROPIC_MODEL", { default: "claude-sonnet-5-5" });
const DAILY_SCAN_LIMIT = 40;
const MAX_IMAGE_BASE64_LENGTH = 8_000_000;

const inputSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_IMAGE_BASE64_LENGTH),
  mimeType: z.enum(["image/jpeg", "image/png"])
});

const systemPrompt = `You extract items from German-language retail receipts only, including Austrian German receipts such as BILLA. The printed text will be German; interpret German labels and Austrian retail conventions, and do not assume English labels. Return JSON only, with no markdown or prose, matching the requested schema. All amounts are signed integer euro cents, never decimal euros. German receipt numbers use a decimal comma (for example 1,29), a dot for thousands, and may use EUR or €. Convert dates from DD.MM.YYYY or DD.MM.YY to YYYY-MM-DD; if no valid date is visible, use a validation error rather than inventing one. The total may be labelled SUMME, GESAMT, or "Summe EUR". Prefer the retailer name (for example BILLA) for storeName, not its address or branch number. Read product descriptions and their corresponding amount column; ignore tax-letter columns such as C or D. On BILLA receipts, "Gegeben", "Kundenbeleg", card/payment details, and authorization numbers are not purchased items; use the first purchase date/time and ignore repeated payment slip details. Treat a line labelled PFANDARTIKEL or similar as a separate Deposit/Pfand item. Preserve the printed German product description in rawName. Translate name to a concise English product name, retaining relevant brand and distinguishing details; for example Vollmilch becomes Whole milk and Äpfel becomes Apples. Do not guess unclear abbreviations or invent product details: retain unclear text and include a warning for review. Preserve discounts and Pfand returns as negative amounts. Classify each line into exactly one of: Groceries, Beverages, Cafe & Eating out, Snacks & Sweets, Alcohol, Tobacco, Household, Drugstore & Personal care, Deposit/Pfand, Other. Use null category only when genuinely uncertain. necessity must be essential, discretionary, or neutral. A Pfand deposit charged is a positive amount; Pfand return/credit is negative. Do not invent missing values. Use quantity 1 when no count is shown.`;

function categoriesFromSettings(value: unknown): ExpenseCategory[] {
  if (typeof value !== "object" || value === null || !("discretionaryCategories" in value)) {
    return ["Cafe & Eating out", "Snacks & Sweets", "Alcohol", "Tobacco"];
  }
  const parsed = z.array(z.enum(expenseCategories)).safeParse(value.discretionaryCategories);
  if (!parsed.success) throw new Error("Kitchen discretionary category settings are invalid.");
  return parsed.data;
}

async function consumeDailyScan(householdId: string): Promise<void> {
  const db = getFirestore();
  const dateKey = new Date().toISOString().slice(0, 10);
  const usageRef = db.doc(`kitchen/${householdId}/usage/${dateKey}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const count: unknown = snapshot.get("scans");
    const currentCount = typeof count === "number" && Number.isInteger(count) ? count : 0;
    if (currentCount >= DAILY_SCAN_LIMIT) {
      throw new HttpsError("resource-exhausted", "The daily receipt scan limit has been reached. Please try again tomorrow.");
    }
    transaction.set(usageRef, { scans: currentCount + 1 }, { merge: true });
  });
}

function extractText(content: Anthropic.Messages.Message["content"]): string {
  const textBlock = content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("The receipt scanner returned no text.");
  }
  return textBlock.text.trim();
}

function parseJson(text: string): unknown {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(withoutFence) as unknown;
}

function providerErrorMessage(error: APIError): string {
  const response = error.error;
  if (
    typeof response === "object"
    && response !== null
    && "error" in response
    && typeof response.error === "object"
    && response.error !== null
    && "message" in response.error
    && typeof response.error.message === "string"
  ) {
    return response.error.message;
  }
  return error.message;
}

export async function requestParsedReceipt(
  client: Anthropic,
  model: string,
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png",
  discretionaryCategories: readonly ExpenseCategory[]
): Promise<z.infer<typeof parsedReceiptSchema>> {
  let correction: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: attempt === 0 ? 8192 : 16384,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: imageBase64 }
          },
          {
            type: "text",
            text: `Extract this receipt. Return a JSON object with storeName, purchaseDateKey, optional purchaseTime, totalCents, optional paymentMethod, lineItems (rawName, name, quantity, amountCents, category, necessity, optional isDeposit), confidence, and warnings. paymentMethod must be exactly "cash", "card", or "other": map credit and debit cards, including Visa, Mastercard, American Express, Maestro, girocard and Bankomat, to "card", and Bargeld to "cash". Use "other" for non-card payments and mixed payment methods. Omit paymentMethod if unknown; do not include card details. Default necessity: Groceries, Household, and Drugstore & Personal care are essential; categories in this kitchen's discretionary list are discretionary; all other categories are neutral. The configured discretionary categories are: ${discretionaryCategories.join(", ")}.${correction ? ` Correct the previous response using this validation feedback: ${correction}` : ""}`
          }
        ]
      }]
    });

    try {
      if (response.stop_reason === "max_tokens") {
        throw new Error("The scanner response was cut off before it finished.");
      }
      return parsedReceiptSchema.parse(parseJson(extractText(response.content)));
    } catch (error) {
      correction = error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
        : error instanceof SyntaxError ? "The scanner returned incomplete or invalid JSON."
        : error instanceof Error ? error.message : String(error);
      if (attempt === 1) {
        console.error("Receipt response validation failed", {
          errorType: error instanceof z.ZodError ? "schema" : error instanceof SyntaxError ? "json" : "response",
          stopReason: response.stop_reason
        });
        throw new HttpsError("invalid-argument", `Receipt could not be validated after retry: ${correction} Please try a clearer image or enter the receipt manually.`);
      }
    }
  }
  throw new HttpsError("internal", "Receipt scanner stopped without a result.");
}

export const scanReceipt = onCall(
  {
    invoker: "public",
    maxInstances: 2,
    timeoutSeconds: 150,
    enforceAppCheck: enforceAppCheck.value(),
    secrets: [anthropicApiKey]
  },
  async (request) => {
    const member = await requireMember(request);
    const parsedInput = inputSchema.safeParse(request.data);
    if (!parsedInput.success) {
      throw new HttpsError("invalid-argument", `Invalid scan request: ${parsedInput.error.issues[0]?.message ?? "invalid input"}`);
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(parsedInput.data.imageBase64)) {
      throw new HttpsError("invalid-argument", "Image data is not valid base64.");
    }
    await consumeDailyScan(member.householdId);

    const apiKey = anthropicApiKey.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "Receipt scanning is not configured on the server.");

    try {
      const client = new Anthropic({ apiKey, timeout: 65_000, maxRetries: 0 });
      const settings = await getFirestore().doc(`kitchen/${member.householdId}`).get();
      const discretionaryCategories = categoriesFromSettings(settings.data());
      const parsed = await requestParsedReceipt(
        client,
        anthropicModel.value(),
        parsedInput.data.imageBase64,
        parsedInput.data.mimeType,
        discretionaryCategories
      );
      return classifyReceiptLines(parsed, discretionaryCategories);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof Anthropic.APIError) {
        console.error("Receipt scanning provider error", {
          name: error.name,
          status: error.status,
          requestID: error.requestID
        });
        if (error.status === 401 || error.status === 403) {
          throw new HttpsError(
            "failed-precondition",
            "The receipt scanning provider rejected its server credentials. Please contact the app administrator."
          );
        }
        if (error.status === 404) {
          throw new HttpsError(
            "failed-precondition",
            "The configured receipt scanning model is unavailable. Please contact the app administrator."
          );
        }
        if (error.status === 429) {
          throw new HttpsError(
            "resource-exhausted",
            "The receipt scanning provider is temporarily rate-limited. Please try again later."
          );
        }
        if (error.status === 400 || error.status === 413) {
          const providerMessage = providerErrorMessage(error).slice(0, 400);
          const requestId = error.requestID ? ` Request ID: ${error.requestID}.` : "";
          throw new HttpsError(
            "invalid-argument",
            `The receipt scanning service rejected the request: ${providerMessage}.${requestId}`
          );
        }
        if (error.status === undefined || error.status >= 500) {
          throw new HttpsError(
            "unavailable",
            "The receipt scanning provider is temporarily unavailable. Please try again later."
          );
        }
      }
      console.error("Receipt scanning failed", {
        name: error instanceof Error ? error.name : "UnknownError"
      });
      throw new HttpsError("internal", "Receipt scan failed. Please retry or enter the expense manually.");
    }
  }
);
