import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useBudgetAlerts: vi.fn(),
  useExpiryWarnings: vi.fn(),
  markBudgetAlertRead: vi.fn(),
  showToast: vi.fn(),
  onOpen: undefined as (() => void) | undefined
}));

vi.mock("./useBudgetData", () => ({ useBudgetAlerts: mocks.useBudgetAlerts }));
vi.mock("./useExpiryWarnings", () => ({ useExpiryWarnings: mocks.useExpiryWarnings }));
vi.mock("./firebase", () => ({ getDatabase: () => "database" }));
vi.mock("./toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@my-kitchen/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@my-kitchen/shared")>(),
  markBudgetAlertRead: mocks.markBudgetAlertRead
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...original,
    Link: (props: React.ComponentProps<typeof original.Link>) => {
      mocks.onOpen = () => props.onClick?.({} as React.MouseEvent<HTMLAnchorElement>);
      return <original.Link {...props} />;
    }
  };
});

import NotificationsPage from "./NotificationsPage";

describe("notifications inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onOpen = undefined;
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

  it("links saved budget alerts to budgets without checking budgets", () => {
    const markup = renderToStaticMarkup(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(markup).toContain('href="/budgets"');
    expect(markup).toContain("Groceries: 100% reached");
    expect(markup).toContain("Mark read");
    expect(markup).not.toContain("Check budgets");
  });

  it("shows loading failures instead of an empty inbox", () => {
    mocks.useBudgetAlerts.mockReturnValue({ loading: false, error: "Access denied", data: null });
    const markup = renderToStaticMarkup(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(markup).toContain("Could not load notifications: Access denied");
    expect(markup).not.toContain("No notifications");
  });

  it("shows current expiry warnings linked to the pantry", () => {
    mocks.useExpiryWarnings.mockReturnValue({
      warnings: [{ id: "milk", item: { name: "Milk", expiryDate: "2026-11-11" } }],
      loading: false, error: null, now: new Date(2026, 10, 11)
    });
    const markup = renderToStaticMarkup(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(markup).toContain("Milk: Expires today");
    expect(markup).toContain("View expiry warning for Milk");
    expect(markup).toContain('href="/"');
  });

  it("marks the opened unread alert as read", () => {
    renderToStaticMarkup(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    mocks.onOpen?.();
    expect(mocks.markBudgetAlertRead).toHaveBeenCalledOnce();
    expect(mocks.markBudgetAlertRead).toHaveBeenCalledWith("database", "alert");
  });

  it("does not rewrite an already-read alert", () => {
    mocks.useBudgetAlerts.mockReturnValue({
      ...mocks.useBudgetAlerts(),
      data: [{ ...mocks.useBudgetAlerts().data[0], alert: { ...mocks.useBudgetAlerts().data[0].alert, read: true } }]
    });
    renderToStaticMarkup(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    mocks.onOpen?.();
    expect(mocks.markBudgetAlertRead).not.toHaveBeenCalled();
  });

  it("reports a failed read update after navigation", async () => {
    mocks.markBudgetAlertRead.mockRejectedValue(new Error("Access denied"));
    renderToStaticMarkup(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    mocks.onOpen?.();
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "Could not mark notification read: Access denied", "error"
    ));
  });
});
