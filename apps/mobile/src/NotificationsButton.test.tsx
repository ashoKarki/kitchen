import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native", () => ({ Pressable: "button", Text: "span" }));
vi.mock("react-native-svg", () => ({ default: "svg", Path: "path" }));
vi.mock("./useBudgetData", () => ({ useBudgetAlerts: () => ({ data: [], error: null }) }));

import NotificationsButton from "./NotificationsButton";

describe("notification bell", () => {
  it("opens the notifications route when pressed", () => {
    const button = NotificationsButton();
    expect(button.props.accessibilityLabel).toBe("Notifications");
    button.props.onPress();
    expect(mocks.push).toHaveBeenCalledWith("/notifications");
  });
});
