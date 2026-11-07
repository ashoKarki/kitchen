import { describe, expect, it } from "vitest";
import { formatQuantity, isValidQuantity, parseQuantity } from "../src/quantity.js";

describe("decimal quantities", () => {
  it("accepts decimal points and commas up to nine places", () => {
    expect(parseQuantity("0.5")).toBe(0.5);
    expect(parseQuantity("  ,25 ")).toBe(0.25);
    expect(parseQuantity("0.000000001")).toBe(0.000000001);
    expect(parseQuantity("9999")).toBe(9999);
  });

  it("rejects empty, negative, excessive precision and out-of-range values", () => {
    for (const value of ["", ".", "-1", "1.0000000001", "10000", "Infinity"]) {
      expect(parseQuantity(value)).toBeNull();
    }
    expect(isValidQuantity(NaN)).toBe(false);
    expect(isValidQuantity(Infinity)).toBe(false);
  });

  it("formats small fractions without scientific notation or stripping integer zeros", () => {
    expect(formatQuantity(0.000000001)).toBe("0.000000001");
    expect(formatQuantity(0.25)).toBe("0.25");
    expect(formatQuantity(100)).toBe("100");
    expect(formatQuantity(0)).toBe("0");
  });
});
