"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyKitchenReminder = void 0;
const app_1 = require("firebase-admin/app");
const reminder_js_1 = require("./reminder.js");
Object.defineProperty(exports, "dailyKitchenReminder", { enumerable: true, get: function () { return reminder_js_1.dailyKitchenReminder; } });
(0, app_1.initializeApp)();
