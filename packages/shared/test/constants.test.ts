import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActiveKitchenId,
  getKitchenDocPath,
  setActiveKitchenId,
  subscribeToActiveKitchenId
} from "../src/constants.js";
import {
  householdBootstrapErrorMessage
} from "../src/householdBootstrap.js";

afterEach(() => {
  setActiveKitchenId(null);
});

describe("active household path", () => {
  it("requires a household before returning its Firestore path", () => {
    expect(() => getKitchenDocPath()).toThrow("A signed-in household is required.");
  });

  describe("household bootstrap errors", () => {
    it("explains when Firestore rules block household setup", () => {
      expect(householdBootstrapErrorMessage({ code: "permission-denied" }))
        .toBe("Firestore blocked household setup. Deploy the updated Firestore rules, then try again.");
    });
  });

  it("updates the active household path and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToActiveKitchenId(listener);

    setActiveKitchenId("household-123");

    expect(getActiveKitchenId()).toBe("household-123");
    expect(getKitchenDocPath()).toBe("kitchen/household-123");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("rejects malformed household identifiers", () => {
    setActiveKitchenId("valid");

    expect(() => setActiveKitchenId("../other")).toThrow("The household identifier is invalid.");
    expect(getActiveKitchenId()).toBe("valid");
  });
});
