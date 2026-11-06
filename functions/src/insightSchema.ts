import { z } from "zod";

const insightSchema = z.object({
  summary: z.string().min(1).max(500),
  observations: z.array(z.string().min(1).max(300)).max(4),
  suggestions: z.array(z.string().min(1).max(300)).max(4)
});

export type GeneratedInsights = z.infer<typeof insightSchema>;

export type InsightParseResult =
  | { success: true; data: GeneratedInsights }
  | { success: false; error: string };

export function parseInsightResponse(text: string): InsightParseResult {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;

  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON response."
    };
  }

  const result = insightSchema.safeParse(value);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
    };
  }
  return { success: true, data: result.data };
}
