import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  nativeModules: {} as Record<string, unknown>,
  platform: { OS: "ios" }
}));

vi.mock("react", () => ({ useEffect: (effect: () => void) => effect() }));
vi.mock("react-native", () => ({
  AppState: {},
  NativeEventEmitter: vi.fn(),
  NativeModules: mocks.nativeModules,
  Platform: mocks.platform
}));
vi.mock("./firebase", () => ({ getDatabase: vi.fn() }));
vi.mock("./saveVoiceShoppingItem", () => ({ saveVoiceShoppingItem: vi.fn() }));
vi.mock("./toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

import VoiceShopping from "./VoiceShopping";

describe("Siri native module availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete mocks.nativeModules.VoiceShoppingModule;
    mocks.platform.OS = "ios";
  });

  it("reports when the installed iOS build does not contain Siri support", () => {
    VoiceShopping({ userId: "user", kitchenId: "home" });
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Siri shopping is unavailable in this build. Rebuild and reinstall the iOS app.", "error"
    );
  });

  it("reports an outdated bridge that cannot claim requests", () => {
    mocks.nativeModules.VoiceShoppingModule = { nextItem: vi.fn(), acknowledge: vi.fn() };
    VoiceShopping({ userId: "user", kitchenId: "home" });
    expect(mocks.showToast).toHaveBeenCalledOnce();
  });

  it("does not warn on platforms without Siri support", () => {
    mocks.platform.OS = "android";
    VoiceShopping({ userId: "user", kitchenId: "home" });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
