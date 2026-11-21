import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useBudgetAlerts: vi.fn(),
  useExpiryWarnings: vi.fn(),
  markBudgetAlertRead: vi.fn(),
  showToast: vi.fn()
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [null, vi.fn()]
}));
vi.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: object) => styles },
  Text: "Text",
  View: "View"
}));
vi.mock("expo-router", () => ({ Link: "Link" }));
vi.mock("@my-kitchen/shared", () => ({
  expiryDescription: () => "Expires today",
  formatCents: (value: number) => String(value),
  markBudgetAlertRead: mocks.markBudgetAlertRead
}));
vi.mock("./firebase", () => ({ getDatabase: () => "database" }));
vi.mock("./useBudgetData", () => ({ useBudgetAlerts: mocks.useBudgetAlerts }));
vi.mock("./useExpiryWarnings", () => ({ useExpiryWarnings: mocks.useExpiryWarnings }));
vi.mock("./toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

import NotificationsScreen from "./NotificationsScreen";

function findBudgetLink(node: ReactNode): { href?: string; onPress?: () => void } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; href?: string; onPress?: () => void }>(child)) continue;
    if (child.props.href === "/budgets") return child.props;
    const found = findBudgetLink(child.props.children);
    if (found) return found;
  }
  return undefined;
}

describe("mobile notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markBudgetAlertRead.mockResolvedValue(undefined);
    mocks.useExpiryWarnings.mockReturnValue({ warnings: [], loading: false, error: null, now: new Date() });
    mocks.useBudgetAlerts.mockReturnValue({
      loading: false,
      error: null,
      data: [{
        id: "alert",
        alert: {
          budgetName: "Groceries",
          thresholdPercent: 100,
          spentCents: 10000,
          amountCents: 10000,
          periodKey: "2026-11",
          read: false,
          createdAt: { toMillis: () => 1, toDate: () => new Date(0) }
        }
      }]
    });
  });

  it("marks the opened unread alert as read and links to budgets", () => {
    const link = findBudgetLink(NotificationsScreen());
    expect(link?.href).toBe("/budgets");
    link?.onPress?.();
    expect(mocks.markBudgetAlertRead).toHaveBeenCalledWith("database", "alert");
  });

  it("does not rewrite an already-read alert", () => {
    const alerts = mocks.useBudgetAlerts();
    alerts.data[0].alert.read = true;
    findBudgetLink(NotificationsScreen())?.onPress?.();
    expect(mocks.markBudgetAlertRead).not.toHaveBeenCalled();
  });

  it("reports a failed read update after navigation", async () => {
    mocks.markBudgetAlertRead.mockRejectedValue(new Error("Access denied"));
    findBudgetLink(NotificationsScreen())?.onPress?.();
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "Could not mark notification read: Access denied", "error"
    ));
  });

  it("shows expiry warnings and links them to the pantry", () => {
    mocks.useExpiryWarnings.mockReturnValue({
      warnings: [{ id: "milk", item: { name: "Milk", expiryDate: "2026-11-11" } }],
      loading: false, error: null, now: new Date()
    });
    const screen = NotificationsScreen();
    const children = Children.toArray(screen.props.children);
    const warning = children.find((child) => isValidElement<{ href?: string }>(child) && child.props.href === "/(tabs)");
    expect(warning).toBeDefined();
  });
});
