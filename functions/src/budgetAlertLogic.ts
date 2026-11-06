import { getHighestReachedBudgetThreshold } from "../../packages/shared/src/budgetAnalytics.js";

export interface BudgetAlertState {
  periodKey: string;
  sentThresholds: number[];
}

export interface BudgetAlertDecision {
  thresholds: number[];
  state: BudgetAlertState;
}

export function decideBudgetAlerts(
  currentState: BudgetAlertState | undefined,
  periodKey: string,
  spentCents: number,
  amountCents: number
): BudgetAlertDecision {
  const sentThresholds = currentState?.periodKey === periodKey
    ? currentState.sentThresholds
    : [];
  const highestSentThreshold = sentThresholds.reduce((highest, threshold) => Math.max(highest, threshold), 0);
  const highestReachedThreshold = getHighestReachedBudgetThreshold(spentCents, amountCents);
  const thresholds = highestReachedThreshold !== null && highestReachedThreshold > highestSentThreshold
    ? [highestReachedThreshold]
    : [];
  return {
    thresholds,
    state: {
      periodKey,
      sentThresholds: [...sentThresholds, ...thresholds]
    }
  };
}
