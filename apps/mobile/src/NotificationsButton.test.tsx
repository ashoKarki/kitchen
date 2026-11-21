import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), useExpiryWarnings: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native", () => ({ Pressable: "button", Text: "span" }));
vi.mock("react-native-svg", () => ({ default: "svg", Path: "path" }));
vi.mock("./useBudgetData", () => ({ useBudgetAlerts: () => ({ data: [], error: null }) }));
vi.mock("./useExpiryWarnings", () => ({ useExpiryWarnings: mocks.useExpiryWarnings }));

import NotificationsButton from "./NotificationsButton";

describe("notification bell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useExpiryWarnings.mockReturnValue({ warnings: [], error: null });
  });
  it("opens the notifications route when pressed", () => {
    const button = NotificationsButton();
    expect(button.props.accessibilityLabel).toBe("Notifications");
    button.props.onPress();
    expect(mocks.push).toHaveBeenCalledWith("/notifications");
  });
  it("counts expiry warnings separately from unread budget alerts", () => {
    mocks.useExpiryWarnings.mockReturnValue({ warnings: [{}, {}], error: null });
    expect(NotificationsButton().props.accessibilityLabel).toBe("Notifications, 2 expiry warnings");
  });
});
