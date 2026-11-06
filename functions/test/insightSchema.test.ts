import { describe, expect, it } from "vitest";
import { parseInsightResponse } from "../src/insightSchema.js";

describe("parseInsightResponse", () => {
  it("parses a valid JSON response wrapped in a Markdown fence", () => {
    expect(parseInsightResponse('```json\n{"summary":"Spending increased.","observations":[],"suggestions":[]}\n```'))
      .toEqual({
        success: true,
        data: { summary: "Spending increased.", observations: [], suggestions: [] }
      });
  });

  it("extracts a JSON object when the model adds surrounding text", () => {
    expect(parseInsightResponse('Here are the insights:\n{"summary":"Stable.","observations":[],"suggestions":[]}'))
      .toMatchObject({ success: true, data: { summary: "Stable." } });
  });

  it("returns useful validation details for malformed JSON or schema", () => {
    expect(parseInsightResponse("not json")).toMatchObject({ success: false, error: expect.stringContaining("Invalid JSON") });
    expect(parseInsightResponse('{"summary":"","observations":[],"suggestions":[]}'))
      .toMatchObject({ success: false, error: expect.stringContaining("summary") });
  });
});
