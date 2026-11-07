import { after, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { evaluateBudget } from "../lib/functions/src/budgetAlerts.js";
import { getDateKeyInTimeZone } from "../../packages/shared/dist/budgetAnalytics.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== "demo-my-kitchen") {
  throw new Error("This test must run against the demo Firestore emulator.");
}

const app = initializeApp({ projectId: "demo-my-kitchen" });
const db = getFirestore(app);
const household = db.doc("kitchen/alerts-test");
const budget = household.collection("budgets").doc("monthly");
const receipt = household.collection("receipts").doc("purchase");
const settings = { timeZone: "UTC", budgetAlertsEnabled: false, discretionaryCategories: [] };

after(async () => { await deleteApp(app); });

test("generates one alert when a budget is exceeded, respects preferences, and remains idempotent", async () => {
  await household.set({ ...settings, members: { owner: "owner" } });
  await household.collection("memberSettings").doc("owner").set({ budgetAlertsEnabled: false });
  await budget.set({ name: "Groceries", period: "monthly", amountCents: 10000, scope: { type: "overall" }, active: true });
  await receipt.set({ purchaseDateKey: getDateKeyInTimeZone(new Date(), "UTC"), totalCents: 11000, lineItems: [] });

  await evaluateBudget(db, "alerts-test", "monthly", settings);
  assert.equal((await household.collection("alerts").get()).size, 0);

  await household.collection("memberSettings").doc("owner").update({ budgetAlertsEnabled: true });
  await Promise.all([
    evaluateBudget(db, "alerts-test", "monthly", settings),
    evaluateBudget(db, "alerts-test", "monthly", settings)
  ]);
  const alerts = await household.collection("alerts").get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].get("thresholdPercent"), 110);
  assert.equal(alerts.docs[0].get("spentCents"), 11000);
  assert.equal(alerts.docs[0].get("read"), false);
  assert.deepEqual((await budget.get()).get("alertState.sentThresholds"), [110]);

  await evaluateBudget(db, "alerts-test", "monthly", settings);
  assert.equal((await household.collection("alerts").get()).size, 1);
});
