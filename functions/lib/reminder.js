"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyKitchenReminder = void 0;
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const expoPush_js_1 = require("./expoPush.js");
const reminderLogic_js_1 = require("./reminderLogic.js");
exports.dailyKitchenReminder = (0, scheduler_1.onSchedule)({ schedule: "0 * * * *", maxInstances: 1, timeoutSeconds: 300 }, async () => {
    try {
        const db = (0, firestore_1.getFirestore)();
        const settingsSnapshot = await db.doc("kitchen/main").get();
        const settings = (0, reminderLogic_js_1.readReminderSettings)(settingsSnapshot.data());
        if (!settings.reminderEnabled)
            return;
        if ((0, reminderLogic_js_1.hourInTimeZone)(new Date(), settings.timeZone) !== settings.reminderHour)
            return;
        const finishedSnapshot = await db.collection("kitchen/main/items")
            .where("state", "==", "finished")
            .get();
        if (finishedSnapshot.empty)
            return;
        const names = finishedSnapshot.docs.map((item) => {
            const name = item.get("name");
            if (typeof name !== "string" || name.trim().length === 0) {
                throw new Error(`Finished item ${item.id} has an invalid name.`);
            }
            return name;
        });
        const devices = await db.collection("kitchen/main/devices").get();
        const tokens = devices.docs.map((device) => device.id);
        if (tokens.length === 0)
            return;
        await (0, expoPush_js_1.sendExpoPush)(tokens, `${names.length} ${names.length === 1 ? "item" : "items"} finished in your kitchen`, (0, reminderLogic_js_1.reminderBody)(names));
    }
    catch (error) {
        console.error("Daily kitchen reminder failed", error);
        throw error;
    }
});
