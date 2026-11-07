import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useBudgetAlerts: vi.fn() }));

vi.mock("./useBudgetData", () => ({ useBudgetAlerts: mocks.useBudgetAlerts }));
vi.mock("./firebase", () => ({ getDatabase: vi.fn() }));

import NotificationsPage from "./NotificationsPage";

describe("notifications inbox", () => {
  beforeEach(() => {
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
});
