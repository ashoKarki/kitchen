import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { sendExpoPush } from "./expoPush.js";
import { hourInTimeZone, readReminderSettings, reminderBody } from "./reminderLogic.js";

export const dailyKitchenReminder = onSchedule(
  { schedule: "0 * * * *", maxInstances: 1, timeoutSeconds: 300 },
  async () => {
    try {
      const db = getFirestore();
      const settingsSnapshot = await db.doc("kitchen/main").get();
      const settings = readReminderSettings(settingsSnapshot.data());
      if (!settings.reminderEnabled) return;
      if (hourInTimeZone(new Date(), settings.timeZone) !== settings.reminderHour) return;

      const finishedSnapshot = await db.collection("kitchen/main/items")
        .where("state", "==", "finished")
        .get();
      if (finishedSnapshot.empty) return;

      const names = finishedSnapshot.docs.map((item) => {
        const name: unknown = item.get("name");
        if (typeof name !== "string" || name.trim().length === 0) {
          throw new Error(`Finished item ${item.id} has an invalid name.`);
        }
        return name;
      });
      const devices = await db.collection("kitchen/main/devices").get();
      const tokens = devices.docs.map((device) => device.id);
      if (tokens.length === 0) return;

      await sendExpoPush(
        tokens,
        `${names.length} ${names.length === 1 ? "item" : "items"} finished in your kitchen`,
        reminderBody(names)
      );
    } catch (error) {
      console.error("Daily kitchen reminder failed", error);
      throw error;
    }
  }
);
