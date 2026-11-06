import { getReachedBudgetThresholds } from "../../packages/shared/src/budgetAnalytics.js";

export interface BudgetAlertState {
  periodKey: string;
  sentThresholds: Array<80 | 100>;
}

export interface BudgetAlertDecision {
  thresholds: Array<80 | 100>;
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
  const thresholds = getReachedBudgetThresholds(spentCents, amountCents)
    .filter((threshold) => !sentThresholds.includes(threshold));
  return {
    thresholds,
    state: {
      periodKey,
      sentThresholds: [...sentThresholds, ...thresholds]
    }
  };
}
