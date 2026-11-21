import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { ItemWithId } from "@my-kitchen/shared";
import type { NotificationRequestInput } from "expo-notifications";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  scheduled: new Map<string, unknown>(),
  permission: { granted: true, canAskAgain: true },
  schedule: vi.fn(),
  cancel: vi.fn()
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => mocks.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { mocks.storage.set(key, value); },
    removeItem: async (key: string) => { mocks.storage.delete(key); }
  }
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: async () => [...mocks.scheduled.keys()].map((identifier) => ({ identifier })),
  cancelScheduledNotificationAsync: mocks.cancel,
  scheduleNotificationAsync: mocks.schedule,
  getPermissionsAsync: async () => mocks.permission,
  requestPermissionsAsync: async () => mocks.permission,
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: vi.fn()
}));

import { clearExpiryNotifications, syncExpiryNotifications } from "./expiryNotifications";

function item(id: string, expiryDate: string, state: "inStock" | "finished" = "inStock"): ItemWithId {
  return {
    id,
    item: { name: id, expiryDate, state, quantity: 1, category: "Groceries", createdAt: new Timestamp(0, 0), updatedAt: new Timestamp(0, 0) }
  };
}

describe("local expiry reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 12));
    vi.clearAllMocks();
    mocks.storage.clear();
    mocks.scheduled.clear();
    mocks.permission = { granted: true, canAskAgain: true };
    mocks.schedule.mockImplementation(async (request: NotificationRequestInput) => {
      if (!request.identifier) throw new Error("Missing identifier");
      mocks.scheduled.set(request.identifier, request);
      return request.identifier;
    });
    mocks.cancel.mockImplementation(async (identifier: string) => { mocks.scheduled.delete(identifier); });
  });
  afterEach(() => vi.useRealTimers());

  it("schedules three calendar days before expiry and does not repeat after delivery", async () => {
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]);
    const request = mocks.schedule.mock.calls[0]?.[0] as NotificationRequestInput;
    expect(request.content.body).toBe("Milk expires on 2026-11-20.");
    expect(request.trigger).toEqual({ type: "date", date: new Date(2026, 10, 17, 9), channelId: "expiry" });
    mocks.scheduled.clear();
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]);
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
  });

  it("notifies soon when the warning date has already passed", async () => {
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-12")]);
    const request = mocks.schedule.mock.calls[0]?.[0] as NotificationRequestInput;
    expect(request.trigger).toEqual({ type: "date", date: new Date(Date.now() + 2000), channelId: "expiry" });
  });

  it("cancels reminders when an item is finished or its date changes", async () => {
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]);
    const old = [...mocks.scheduled.keys()][0];
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-21")]);
    expect(mocks.cancel).toHaveBeenCalledWith(old);
    expect(mocks.scheduled.size).toBe(1);
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-21", "finished")]);
    expect(mocks.scheduled.size).toBe(0);
  });

  it("removes old household reminders and leaves unrelated notifications alone", async () => {
    mocks.scheduled.set("other-feature", {});
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]);
    await syncExpiryNotifications("user", "other-home", [item("Eggs", "2026-11-21")]);
    expect([...mocks.scheduled.keys()].some((id) => id.includes(":home:"))).toBe(false);
    await clearExpiryNotifications();
    expect([...mocks.scheduled.keys()]).toEqual(["other-feature"]);
  });

  it("reports denied permissions without claiming reminders were scheduled", async () => {
    mocks.permission = { granted: false, canAskAgain: false };
    await expect(syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]))
      .rejects.toThrow("Allow notifications");
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("retries a notification when scheduling fails", async () => {
    mocks.schedule.mockRejectedValueOnce(new Error("Native scheduler failed"));
    await expect(syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]))
      .rejects.toThrow("Native scheduler failed");
    await syncExpiryNotifications("user", "home", [item("Milk", "2026-11-20")]);
    expect(mocks.schedule).toHaveBeenCalledTimes(2);
    expect(mocks.scheduled.size).toBe(1);
  });

  it("reports when the device limit prevents scheduling all reminders", async () => {
    const items = Array.from({ length: 61 }, (_, index) => item(`item-${index}`, "2026-11-20"));
    await expect(syncExpiryNotifications("user", "home", items)).rejects.toThrow("too many pending notifications");
    expect(mocks.schedule).toHaveBeenCalledTimes(60);
  });
});
