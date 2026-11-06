import { describe, expect, it } from "vitest";
import { KITCHEN_OWNER_EMAIL } from "../../packages/shared/src/constants.js";
import { isKitchenOwner } from "../src/auth.js";

describe("isKitchenOwner", () => {
  it("accepts only the verified kitchen owner email", () => {
    expect(isKitchenOwner(KITCHEN_OWNER_EMAIL, true)).toBe(true);
    expect(isKitchenOwner(KITCHEN_OWNER_EMAIL.toUpperCase(), true)).toBe(true);
    expect(isKitchenOwner("someone-else@example.com", true)).toBe(false);
    expect(isKitchenOwner(KITCHEN_OWNER_EMAIL, false)).toBe(false);
    expect(isKitchenOwner(undefined, true)).toBe(false);
  });
});
