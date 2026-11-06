import { describe, expect, it } from "vitest";
import { decideBudgetAlerts } from "../src/budgetAlertLogic.js";

describe("decideBudgetAlerts", () => {
  it("creates an alert once when each threshold is reached in a period", () => {
    const first = decideBudgetAlerts(undefined, "2026-11", 800, 1000);
    expect(first.thresholds).toEqual([80]);

    const next = decideBudgetAlerts(first.state, "2026-11", 1050, 1000);
    expect(next.thresholds).toEqual([100]);

    const repeated = decideBudgetAlerts(next.state, "2026-11", 1200, 1000);
    expect(repeated.thresholds).toEqual([]);
  });

  it("resets the sent thresholds at the next period", () => {
    const next = decideBudgetAlerts(
      { periodKey: "2026-10", sentThresholds: [80, 100] },
      "2026-11",
      900,
      1000
    );
    expect(next.thresholds).toEqual([80]);
    expect(next.state).toEqual({ periodKey: "2026-11", sentThresholds: [80] });
  });
});
