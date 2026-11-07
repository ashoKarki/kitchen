import { describe, expect, it } from "vitest";
import { decideBudgetAlerts } from "../src/budgetAlertLogic.js";

describe("decideBudgetAlerts", () => {
  it("creates an alert once when each threshold is reached in a period", () => {
    const first = decideBudgetAlerts(undefined, "2026-11", 700, 1000);
    expect(first.thresholds).toEqual([70]);

    const jump = decideBudgetAlerts(first.state, "2026-11", 950, 1000);
    expect(jump.thresholds).toEqual([94]);

    const repeated = decideBudgetAlerts(jump.state, "2026-11", 950, 1000);
    expect(repeated.thresholds).toEqual([]);
  });

  it("sends one highest alert per jump and stays silent when spend drops then recovers", () => {
    const initial = decideBudgetAlerts(undefined, "2026-11", 920, 1000);
    expect(initial.thresholds).toEqual([92]);

    const lowered = decideBudgetAlerts(initial.state, "2026-11", 680, 1000);
    expect(lowered.thresholds).toEqual([]);
    expect(lowered.state.sentThresholds).toEqual([92]);

    const recovered = decideBudgetAlerts(lowered.state, "2026-11", 900, 1000);
    expect(recovered.thresholds).toEqual([]);

    const increased = decideBudgetAlerts(recovered.state, "2026-11", 940, 1000);
    expect(increased.thresholds).toEqual([94]);
  });

  it("resets the sent thresholds at the next period", () => {
    const next = decideBudgetAlerts(
      { periodKey: "2026-10", sentThresholds: [80, 100] },
      "2026-11",
      900,
      1000
    );
    expect(next.thresholds).toEqual([90]);
    expect(next.state).toEqual({ periodKey: "2026-11", sentThresholds: [90] });
  });

  it("adds alerts at 98%, 100%, and each further ten percent", () => {
    const at98 = decideBudgetAlerts(undefined, "2026-11", 9800, 10000);
    expect(at98.thresholds).toEqual([98]);
    const at100 = decideBudgetAlerts(at98.state, "2026-11", 10000, 10000);
    expect(at100.thresholds).toEqual([100]);
    const at110 = decideBudgetAlerts(at100.state, "2026-11", 11000, 10000);
    expect(at110.thresholds).toEqual([110]);
  });
});
