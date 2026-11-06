import { initializeApp } from "firebase-admin/app";
import { dailyKitchenReminder } from "./reminder.js";
import { scanReceipt } from "./scanReceipt.js";
import { generateInsights } from "./generateInsights.js";
import {
  bootstrapKitchen,
  createInvite,
  deleteMyAccount,
  joinHousehold,
  leaveHousehold,
  listHouseholdMembers,
  removeHouseholdMember,
  transferOwnership
} from "./household.js";
import {
  evaluateBudgetAfterBudgetChange,
  evaluateBudgetAfterMemberSettingsChange,
  evaluateBudgetAfterReceiptChange,
  evaluateBudgetAfterSettingsChange,
  sendBudgetAlertPush
} from "./budgetAlerts.js";

initializeApp();

export {
  bootstrapKitchen,
  createInvite,
  deleteMyAccount,
  dailyKitchenReminder,
  evaluateBudgetAfterBudgetChange,
  evaluateBudgetAfterMemberSettingsChange,
  evaluateBudgetAfterReceiptChange,
  evaluateBudgetAfterSettingsChange,
  generateInsights,
  joinHousehold,
  leaveHousehold,
  listHouseholdMembers,
  removeHouseholdMember,
  scanReceipt,
  sendBudgetAlertPush,
  transferOwnership
};
