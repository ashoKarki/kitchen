import { describe, expect, it } from "vitest";
import { isVerifiedAccount } from "../src/auth.js";

describe("verified account validation", () => {
  it("requires a non-empty email and a verified Google identity", () => {
    expect(isVerifiedAccount("owner@example.com", true)).toBe(true);
    expect(isVerifiedAccount("partner@example.com", true)).toBe(true);
    expect(isVerifiedAccount("owner@example.com", false)).toBe(false);
    expect(isVerifiedAccount(undefined, true)).toBe(false);
    expect(isVerifiedAccount("", true)).toBe(false);
  });
});
