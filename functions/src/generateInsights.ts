import Anthropic, { type APIError } from "@anthropic-ai/sdk";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { expenseCategories } from "../../packages/shared/src/types.js";
import { requireMember } from "./auth.js";
import { enforceAppCheck } from "./household.js";
import { parseInsightResponse } from "./insightSchema.js";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const anthropicModel = defineString("ANTHROPIC_MODEL", { default: "claude-sonnet-5-5" });
const DAILY_INSIGHT_LIMIT = 10;

const inputSchema = z.object({
  context: z.object({
    currentPeriod: z.object({
      label: z.string().min(1).max(40),
      receiptCount: z.number().int().min(0).max(10000),
      totalCents: z.number().int().safe()
    }),
    previousPeriod: z.object({
      label: z.string().min(1).max(40),
      receiptCount: z.number().int().min(0).max(10000),
      totalCents: z.number().int().safe()
    }),
    categoryTotals: z.array(z.object({
      category: z.enum(expenseCategories),
      amountCents: z.number().int().safe()
    })).max(10),
    discretionaryCents: z.number().int().safe(),
    discretionarySharePercent: z.number().int().min(0).max(100),
    budgetSummaries: z.array(z.object({
      name: z.string().min(1).max(100),
      period: z.enum(["weekly", "monthly"]),
      amountCents: z.number().int().positive().safe(),
      spentCents: z.number().int().safe()
    })).max(30)
  })
});

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

async function consumeDailyInsight(householdId: string): Promise<void> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const reference = getFirestore().doc(`kitchen/${householdId}/usage/insights-${dateKey}`);
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const rawCount: unknown = snapshot.get("requests");
    const currentCount = typeof rawCount === "number" && Number.isInteger(rawCount) ? rawCount : 0;
    if (currentCount >= DAILY_INSIGHT_LIMIT) {
      throw new HttpsError("resource-exhausted", "The daily AI insights limit has been reached. Try again tomorrow.");
    }
    transaction.set(reference, { requests: currentCount + 1 }, { merge: true });
  });
}

export const generateInsights = onCall(
  {
    invoker: "public",
    enforceAppCheck: enforceAppCheck.value(),
    secrets: [anthropicApiKey],
    timeoutSeconds: 60,
    maxInstances: 2,
    memory: "512MiB"
  },
  async (request) => {
    const member = await requireMember(request);
    const parsedInput = inputSchema.safeParse(request.data);
    if (!parsedInput.success) {
      throw new HttpsError("invalid-argument", `Invalid insight data: ${parsedInput.error.message}`);
    }
    const apiKey = anthropicApiKey.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "AI insights are not configured.");
    await consumeDailyInsight(member.householdId);

    try {
      const client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 });
      const system = "You provide concise, neutral spending observations from aggregate household expense data. Do not give investment, tax, debt, or other professional financial advice. Do not invent missing facts or assume the user has a problem. Return only a valid JSON object with exactly summary, observations (up to 4 strings), and suggestions (up to 4 strings). Suggestions must be practical, optional, and non-judgmental. Keep the entire response concise.";
      let correction: string | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await client.messages.create({
          model: anthropicModel.value(),
          max_tokens: 1600,
          system,
          messages: [{
            role: "user",
            content: `Analyze these aggregate expense figures. Do not infer individual purchases or identity. Data: ${JSON.stringify(parsedInput.data.context)}${correction ? ` Your previous response was invalid: ${correction}. Return a corrected JSON object only.` : ""}`
          }]
        });
        const text = response.content.find((block) => block.type === "text")?.text ?? "";
        const result = parseInsightResponse(text);
        if (result.success) return result.data;
        correction = result.error.slice(0, 1000);
      }
      console.error("AI insights response validation failed");
      throw new HttpsError(
        "internal",
        `The AI insights response was invalid after retry: ${correction ?? "No response was returned."}`
      );
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof Anthropic.APIError) {
        console.error("AI insights provider error", {
          name: error.name,
          status: error.status,
          requestID: error.requestID
        });
        if (error.status === 401 || error.status === 403) {
          throw new HttpsError(
            "failed-precondition",
            "The AI insights provider rejected its server credentials. Please contact the app administrator."
          );
        }
        if (error.status === 404) {
          throw new HttpsError(
            "failed-precondition",
            "The configured AI insights model is unavailable. Please contact the app administrator."
          );
        }
        if (error.status === 429) {
          throw new HttpsError(
            "resource-exhausted",
            "The AI insights provider is temporarily rate-limited. Please try again later."
          );
        }
        if (error.status === 400) {
          const providerMessage = providerErrorMessage(error).slice(0, 400);
          const requestId = error.requestID ? ` Request ID: ${error.requestID}.` : "";
          throw new HttpsError(
            "invalid-argument",
            `The AI insights provider rejected the request: ${providerMessage}.${requestId}`
          );
        }
        if (error.status === undefined || error.status >= 500) {
          throw new HttpsError(
            "unavailable",
            "The AI insights provider is temporarily unavailable. Please try again later."
          );
        }
      }
      console.error("AI expense insights failed", {
        name: error instanceof Error ? error.name : "UnknownError"
      });
      throw new HttpsError("internal", "Could not generate AI insights. Please try again later.");
    }
  }
);
