import { describe, expect, it } from "vitest";
import { formatCents, parseEuroCents } from "../src/money.js";

describe("formatCents", () => {
  it("formats integer cents as German-style EUR", () => {
    expect(formatCents(129)).toBe("1,29 €");
    expect(formatCents(-3720)).toBe("-37,20 €");
  });

  it("rejects non-integer monetary values", () => {
    expect(() => formatCents(1.5)).toThrow(RangeError);
  });

  it.each([
    ["1,29", 129],
    ["1.2", 120],
    ["-37,20", -3720],
    ["0", 0],
    ["1,999", null],
    ["1.000,00", null],
    ["", null]
  ])("parses %s to integer cents", (value, cents) => {
    expect(parseEuroCents(value)).toBe(cents);
  });
});
