import { getFirestore, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { z } from "zod";
import {
  getBudgetPeriodBounds,
  getBudgetSpendCents,
  getDateKeyInTimeZone
} from "../../packages/shared/src/budgetAnalytics.js";
import { expenseCategories } from "../../packages/shared/src/types.js";
import type { BudgetAlert } from "../../packages/shared/src/types.js";
import { sendExpoPush } from "./expoPush.js";
import { decideBudgetAlerts, type BudgetAlertState } from "./budgetAlertLogic.js";

const settingsSchema = z.object({
  timeZone: z.string().min(1),
  budgetAlertsEnabled: z.boolean(),
  discretionaryCategories: z.array(z.enum(expenseCategories))
});
const budgetSchema = z.object({
  name: z.string().min(1).max(100),
  period: z.enum(["weekly", "monthly"]),
  amountCents: z.number().int().positive(),
  scope: z.discriminatedUnion("type", [
    z.object({ type: z.literal("overall") }),
    z.object({ type: z.literal("discretionary") }),
    z.object({ type: z.literal("categories"), categories: z.array(z.enum(expenseCategories)).min(1).max(10) })
  ]),
  active: z.boolean(),
  alertState: z.object({
    periodKey: z.string(),
    sentThresholds: z.array(z.number().int().min(70))
  }).optional()
});
const receiptSchema = z.object({
  purchaseDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCents: z.number().int(),
  lineItems: z.array(z.object({
    amountCents: z.number().int(),
    category: z.enum(expenseCategories),
    necessity: z.enum(["essential", "discretionary", "neutral"])
  }))
});

type Settings = z.infer<typeof settingsSchema>;

function readSettings(value: unknown): Settings {
  const result = settingsSchema.safeParse(value);
  if (!result.success) throw new Error(`Budget alert settings are invalid: ${result.error.message}`);
  new Intl.DateTimeFormat("en-US", { timeZone: result.data.timeZone }).format(new Date(0));
  return result.data;
}

function memberAlertPreference(value: unknown, fallback: boolean): boolean {
  if (
    typeof value === "object"
    && value !== null
    && "budgetAlertsEnabled" in value
    && typeof value.budgetAlertsEnabled === "boolean"
  ) {
    return value.budgetAlertsEnabled;
  }
  return fallback;
}

async function anyMemberHasBudgetAlerts(db: Firestore, fallback: boolean): Promise<boolean> {
  const kitchen = await db.doc("kitchen/main").get();
  const members: unknown = kitchen.get("members");
  if (typeof members !== "object" || members === null || Array.isArray(members)) return fallback;
  const uids = Object.entries(members)
    .filter(([, role]) => role === "owner" || role === "member")
    .map(([uid]) => uid);
  if (uids.length === 0) return fallback;
  const settings = await Promise.all(uids.map((uid) => (
    db.doc(`kitchen/main/memberSettings/${uid}`).get()
  )));
  return settings.some((snapshot) => memberAlertPreference(snapshot.data(), fallback));
}

function shouldReevaluateBudget(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!after) return false;
  if (!before) return true;
  return ["name", "period", "amountCents", "scope", "active"]
    .some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function shouldReevaluateSettings(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!after) return false;
  if (!before) return true;
  return ["budgetAlertsEnabled", "timeZone", "discretionaryCategories"]
    .some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

async function evaluateBudget(db: Firestore, budgetId: string, settings: Settings): Promise<void> {
  if (!await anyMemberHasBudgetAlerts(db, settings.budgetAlertsEnabled)) return;
  const budgetRef = db.doc(`kitchen/main/budgets/${budgetId}`);
  const budgetSnapshot = await budgetRef.get();
  if (!budgetSnapshot.exists) return;
  const parsedBudget = budgetSchema.safeParse(budgetSnapshot.data());
  if (!parsedBudget.success) {
    throw new Error(`Budget ${budgetId} is invalid: ${parsedBudget.error.message}`);
  }
  const budget = parsedBudget.data;
  if (!budget.active) return;

  const bounds = getBudgetPeriodBounds(new Date(), budget.period, settings.timeZone);
  const startDateKey = getDateKeyInTimeZone(bounds.start, settings.timeZone);
  const endDateKey = getDateKeyInTimeZone(bounds.endExclusive, settings.timeZone);
  const receiptSnapshot = await db.collection("kitchen/main/receipts")
    .where("purchaseDateKey", ">=", startDateKey)
    .where("purchaseDateKey", "<", endDateKey)
    .get();
  const periodReceipts = receiptSnapshot.docs.map((entry) => {
    const parsed = receiptSchema.safeParse(entry.data());
    if (!parsed.success) throw new Error(`Receipt ${entry.id} is invalid: ${parsed.error.message}`);
    return parsed.data;
  });
  const spentCents = getBudgetSpendCents(
    periodReceipts,
    budget.scope,
    settings.discretionaryCategories
  );
  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(budgetRef);
    if (!latest.exists) return;
    const latestBudget = budgetSchema.safeParse(latest.data());
    if (!latestBudget.success) throw new Error(`Budget ${budgetId} is invalid: ${latestBudget.error.message}`);
    if (!latestBudget.data.active || !settings.budgetAlertsEnabled) return;
    const previousState = latestBudget.data.alertState as BudgetAlertState | undefined;
    const decision = decideBudgetAlerts(previousState, bounds.key, spentCents, latestBudget.data.amountCents);
    if (decision.thresholds.length === 0) return;
    transaction.update(budgetRef, { alertState: decision.state });
    for (const thresholdPercent of decision.thresholds) {
      const id = `${budgetId}_${bounds.key}_${thresholdPercent}`;
      const alertRef = db.doc(`kitchen/main/alerts/${id}`);
      const alert: Omit<BudgetAlert, "createdAt"> = {
        budgetId,
        budgetName: latestBudget.data.name,
        period: latestBudget.data.period,
        periodKey: bounds.key,
        thresholdPercent,
        amountCents: latestBudget.data.amountCents,
        spentCents,
        read: false
      };
      transaction.set(alertRef, { ...alert, createdAt: Timestamp.now() });
    }
  });
}

async function evaluateAllBudgets(db: Firestore, settings: Settings): Promise<void> {
  if (!await anyMemberHasBudgetAlerts(db, settings.budgetAlertsEnabled)) return;
  const budgets = await db.collection("kitchen/main/budgets").get();
  await Promise.all(budgets.docs.map((budget) => evaluateBudget(db, budget.id, settings)));
}

export const evaluateBudgetAfterReceiptChange = onDocumentWritten(
  { document: "kitchen/main/receipts/{receiptId}", retry: true },
  async () => {
    const db = getFirestore();
    const settings = readSettings((await db.doc("kitchen/main").get()).data());
    await evaluateAllBudgets(db, settings);
  }
);

export const evaluateBudgetAfterBudgetChange = onDocumentWritten(
  { document: "kitchen/main/budgets/{budgetId}", retry: true },
  async (event) => {
    if (!shouldReevaluateBudget(event.data?.before.data(), event.data?.after.data())) return;
    const db = getFirestore();
    const settings = readSettings((await db.doc("kitchen/main").get()).data());
    if (!settings.budgetAlertsEnabled) return;
    await evaluateBudget(db, event.params.budgetId, settings);
  }
);

export const evaluateBudgetAfterSettingsChange = onDocumentWritten(
  { document: "kitchen/main", retry: true },
  async (event) => {
    if (!shouldReevaluateSettings(event.data?.before.data(), event.data?.after.data())) return;
    const db = getFirestore();
    const settings = readSettings(event.data?.after.data());
    await evaluateAllBudgets(db, settings);
  }
);

export const evaluateBudgetAfterMemberSettingsChange = onDocumentWritten(
  { document: "kitchen/main/memberSettings/{uid}", retry: true },
  async (event) => {
    if (JSON.stringify(event.data?.before.get("budgetAlertsEnabled")) === JSON.stringify(event.data?.after.get("budgetAlertsEnabled"))) {
      return;
    }
    const db = getFirestore();
    const settings = readSettings((await db.doc("kitchen/main").get()).data());
    await evaluateAllBudgets(db, settings);
  }
);

export const sendBudgetAlertPush = onDocumentCreated(
  { document: "kitchen/main/alerts/{alertId}", retry: true, timeoutSeconds: 300, maxInstances: 2 },
  async (event) => {
    const db = getFirestore();
    const settings = readSettings((await db.doc("kitchen/main").get()).data());
    if (!settings.budgetAlertsEnabled) return;
    const alert = z.object({
      budgetName: z.string().min(1),
      thresholdPercent: z.number().int().min(70),
      spentCents: z.number().int(),
      amountCents: z.number().int()
    }).parse(event.data?.data());
    const devices = await db.collection("kitchen/main/devices").get();
    const preferences = new Map<string, boolean>();
    const tokens: string[] = [];
    for (const device of devices.docs) {
      const uid: unknown = device.get("uid");
      if (typeof uid !== "string") {
        if (settings.budgetAlertsEnabled) tokens.push(device.id);
        continue;
      }
      let enabled = preferences.get(uid);
      if (enabled === undefined) {
        const memberSettings = await db.doc(`kitchen/main/memberSettings/${uid}`).get();
        enabled = memberAlertPreference(memberSettings.data(), settings.budgetAlertsEnabled);
        preferences.set(uid, enabled);
      }
      if (enabled) tokens.push(device.id);
    }
    if (tokens.length === 0) return;
    await sendExpoPush(
      tokens,
      `${alert.budgetName}: ${alert.thresholdPercent}% budget reached`,
      `${(alert.spentCents / 100).toFixed(2)} € of ${(alert.amountCents / 100).toFixed(2)} €`,
      "expenses"
    );
  }
);
