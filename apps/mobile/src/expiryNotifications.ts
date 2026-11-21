import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { expiryWarningDays, type ItemWithId } from "@my-kitchen/shared";

const storageKey = "my-kitchen:expiry-notifications:v1";
const prefix = "my-kitchen-expiry:";
const maxPending = 60;
let sequence: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): Promise<void> {
  const task = sequence.then(work);
  sequence = task.catch(() => undefined);
  return task;
}

async function readRecords(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Object.entries(value).some(([key, signature]) => !key.startsWith(prefix) || typeof signature !== "string")) {
    throw new Error("Saved expiry notification state is invalid.");
  }
  return value as Record<string, string>;
}

function warningTime(expiryDate: string): Date {
  const [year, month, day] = expiryDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) throw new Error("Invalid expiry date.");
  return new Date(year, month - 1, day - expiryWarningDays, 9);
}

export function syncExpiryNotifications(
  userId: string,
  kitchenId: string,
  items: readonly ItemWithId[],
  isActive: () => boolean = () => true
): Promise<void> {
  return enqueue(async () => {
    if (!isActive()) return;
    const records = await readRecords();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const pending = new Set(scheduled.map((entry) => entry.identifier));
    const candidates = items.filter(({ item }) => item.state === "inStock" && item.quantity > 0 && !item.deletedAt && item.expiryDate)
      .map(({ id, item }) => {
        const date = item.expiryDate;
        if (!date) throw new Error("An expiry date is missing.");
        const identifier = `${prefix}${encodeURIComponent(userId)}:${encodeURIComponent(kitchenId)}:${encodeURIComponent(id)}:${date}`;
        const at = warningTime(date);
        return { identifier, at, name: item.name, date, signature: `${item.name}|${at.getTime()}` };
      }).sort((a, b) => a.at.getTime() - b.at.getTime());
    const wanted = new Set(candidates.map((candidate) => candidate.identifier));

    for (const identifier of pending) {
      if (identifier.startsWith(prefix) && !wanted.has(identifier)) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        pending.delete(identifier);
      }
    }
    for (const identifier of Object.keys(records)) {
      if (!wanted.has(identifier)) delete records[identifier];
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify(records));
    if (!isActive() || candidates.length === 0) return;

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) throw new Error("Allow notifications in system settings to receive expiry reminders.");
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("expiry", {
        name: "Expiry warnings",
        importance: Notifications.AndroidImportance.DEFAULT
      });
    }

    let slots = Math.max(0, maxPending - pending.size);
    let deferred = false;
    for (const candidate of candidates) {
      if (!isActive()) return;
      const alreadyPending = pending.has(candidate.identifier);
      if (records[candidate.identifier] === candidate.signature) continue;
      if (records[candidate.identifier] && !alreadyPending) continue;
      if (!alreadyPending && slots === 0) {
        deferred = true;
        continue;
      }
      const date = new Date(Math.max(candidate.at.getTime(), Date.now() + 2000));
      await Notifications.scheduleNotificationAsync({
        identifier: candidate.identifier,
        content: {
          title: "Food expiry warning",
          body: `${candidate.name} expires on ${candidate.date}.`,
          data: { screen: "pantry" },
          sound: "default"
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: "expiry" }
      });
      if (!alreadyPending) {
        pending.add(candidate.identifier);
        slots--;
      }
      records[candidate.identifier] = candidate.signature;
      await AsyncStorage.setItem(storageKey, JSON.stringify(records));
    }
    if (deferred) throw new Error("Some expiry reminders could not be scheduled because this device has too many pending notifications. Open the app again later.");
  });
}

export function clearExpiryNotifications(): Promise<void> {
  return enqueue(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const entry of scheduled) {
      if (entry.identifier.startsWith(prefix)) await Notifications.cancelScheduledNotificationAsync(entry.identifier);
    }
    await AsyncStorage.removeItem(storageKey);
  });
}
