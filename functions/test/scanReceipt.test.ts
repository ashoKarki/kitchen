import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { requestParsedReceipt } from "../src/scanReceipt.js";

const receipt = {
  storeName: "Store",
  purchaseDateKey: "2026-11-07",
  totalCents: 4000,
  lineItems: Array.from({ length: 40 }, (_, index) => ({
    rawName: `Artikel ${index}`,
    name: `Item ${index}`,
    quantity: 1,
    amountCents: 100,
    category: "Groceries",
    necessity: "essential"
  })),
  confidence: 0.9,
  warnings: []
};

function response(text: string, stopReason: "max_tokens" | "end_turn") {
  return {
    content: [{ type: "text", text, citations: null }],
    stop_reason: stopReason
  } as Anthropic.Messages.Message;
}

describe("receipt scan response handling", () => {
  it("retries a truncated response with more tokens and accepts all receipt lines", async () => {
    const client = new Anthropic({ apiKey: "test" });
    const create = vi.spyOn(client.messages, "create")
      .mockResolvedValueOnce(response('{"lineItems":[{"name":"unfinish', "max_tokens"))
      .mockResolvedValueOnce(response(JSON.stringify(receipt), "end_turn"));
    const result = await requestParsedReceipt(client, "test-model", "aGVsbG8=", "image/jpeg", []);
    expect(result.lineItems).toHaveLength(40);
    expect(create.mock.calls[0]?.[0].max_tokens).toBe(8192);
    expect(create.mock.calls[1]?.[0].max_tokens).toBe(16384);
    expect(JSON.stringify(create.mock.calls[1]?.[0])).toContain("cut off");
  });

  it("retries malformed JSON and returns a validated result", async () => {
    const client = new Anthropic({ apiKey: "test" });
    const create = vi.spyOn(client.messages, "create")
      .mockResolvedValueOnce(response('{"storeName":"unfinished', "end_turn"))
      .mockResolvedValueOnce(response(JSON.stringify(receipt), "end_turn"));
    expect((await requestParsedReceipt(client, "test-model", "aGVsbG8=", "image/jpeg", [])).lineItems).toHaveLength(40);
    expect(JSON.stringify(create.mock.calls[1]?.[0])).toContain("incomplete or invalid JSON");
  });

  it("reports repeated truncation without returning partial receipt data", async () => {
    const client = new Anthropic({ apiKey: "test" });
    vi.spyOn(client.messages, "create")
      .mockResolvedValue(response(JSON.stringify(receipt), "max_tokens"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(requestParsedReceipt(client, "test-model", "aGVsbG8=", "image/jpeg", []))
        .rejects.toThrow("cut off before it finished");
      expect(log).toHaveBeenCalledWith("Receipt response validation failed", {
        errorType: "response", stopReason: "max_tokens"
      });
    } finally {
      log.mockRestore();
    }
  });
});
