import { getReachedBudgetThresholds } from "../../packages/shared/src/budgetAnalytics.js";
export function decideBudgetAlerts(currentState, periodKey, spentCents, amountCents) {
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
