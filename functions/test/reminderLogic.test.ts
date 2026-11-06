import { describe, expect, it } from "vitest";
import { hourInTimeZone, readReminderSettings, reminderBody } from "../src/reminderLogic.js";

describe("reminder schedule helpers", () => {
  it("reads local hours with the configured timezone and h23 cycle", () => {
    expect(hourInTimeZone(new Date("2026-03-29T00:00:00Z"), "Europe/Berlin")).toBe(1);
    expect(hourInTimeZone(new Date("2026-03-29T01:00:00Z"), "Europe/Berlin")).toBe(3);
  });

  it("rejects invalid reminder settings and invalid timezone names", () => {
    expect(() => readReminderSettings({ reminderEnabled: true, reminderHour: 24, timeZone: "UTC" })).toThrow();
    expect(() => readReminderSettings({ reminderEnabled: true, reminderHour: 9, timeZone: "not/a-timezone" })).toThrow();
  });

  it("lists up to five finished item names and counts the remainder", () => {
    expect(reminderBody(["Milk", "Bread", "Rice", "Tea", "Coffee", "Apples"])).toBe(
      "Milk, Bread, Rice, Tea, Coffee, +1 more"
    );
    expect(reminderBody(["Milk"])).toBe("Milk");
  });
});
