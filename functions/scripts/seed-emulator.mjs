import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { dedupeHash } from "../../packages/shared/dist/dedupe.js";

const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorAddress || !/^(127\.0\.0\.1|localhost):8080$/.test(emulatorAddress)) {
  throw new Error("Refusing to seed: FIRESTORE_EMULATOR_HOST must point to local port 8080.");
}

const projectId = process.env.GCLOUD_PROJECT;
if (projectId !== "demo-my-kitchen") {
  throw new Error("Refusing to seed: run with the explicit demo-my-kitchen emulator project.");
}

const fixturesPath = fileURLToPath(new URL("../../packages/shared/test/fixtures/receipts.de.json", import.meta.url));
const fixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
if (
  !Array.isArray(fixtures)
  || fixtures.length === 0
  || fixtures.some((fixture) =>
    typeof fixture.id !== "string"
    || typeof fixture.storeName !== "string"
    || typeof fixture.purchaseDateKey !== "string"
    || !Number.isSafeInteger(fixture.totalCents)
    || !Array.isArray(fixture.lineItems)
    || fixture.lineItems.reduce((sum, line) => sum + line.amountCents, 0) !== fixture.totalCents
  )
) {
  throw new Error("German receipt fixtures are empty or invalid.");
}

const app = initializeApp({ projectId });
const db = getFirestore(app);
const createdAt = Timestamp.now();
try {
  const kitchenRef = db.doc("kitchen/main");
  await kitchenRef.set({
    reminderEnabled: false,
    reminderHour: 9,
    timeZone: "Europe/Berlin",
    budgetAlertsEnabled: true,
    discretionaryCategories: ["Cafe & Eating out", "Snacks & Sweets", "Alcohol", "Tobacco"]
  }, { merge: true });

  for (const fixture of fixtures) {
    await db.doc(`kitchen/main/receipts/${fixture.id}`).set({
      source: "manual",
      storeName: fixture.storeName,
      purchaseDateKey: fixture.purchaseDateKey,
      purchaseTime: fixture.purchaseTime,
      totalCents: fixture.totalCents,
      currency: "EUR",
      paymentMethod: fixture.paymentMethod,
      lineItems: fixture.lineItems,
      dedupeHash: dedupeHash(fixture.storeName, fixture.purchaseDateKey, fixture.totalCents),
      createdAt,
      updatedAt: createdAt
    });
  }

  const demoItems = [
    { id: "demo-milk", name: "Milch", quantity: 1, category: "Groceries", state: "inStock" },
    { id: "demo-coffee", name: "Kaffee", quantity: 1, category: "Beverages", state: "finished" },
    { id: "demo-bread", name: "Vollkornbrot", quantity: 1, category: "Groceries", state: "toBuy" }
  ];
  for (const item of demoItems) {
    await db.doc(`kitchen/main/items/${item.id}`).set({
      name: item.name,
      quantity: item.quantity,
      category: item.category,
      state: item.state,
      createdAt,
      updatedAt: createdAt
    });
  }

  const demoBudgets = [
    {
      id: "demo-monthly-groceries",
      name: "Monthly groceries",
      period: "monthly",
      amountCents: 25000,
      scope: { type: "categories", categories: ["Groceries"] },
      active: true
    },
    {
      id: "demo-weekly-discretionary",
      name: "Weekly discretionary",
      period: "weekly",
      amountCents: 8000,
      scope: { type: "discretionary" },
      active: true
    }
  ];
  for (const budget of demoBudgets) {
    await db.doc(`kitchen/main/budgets/${budget.id}`).set({
      name: budget.name,
      period: budget.period,
      amountCents: budget.amountCents,
      scope: budget.scope,
      active: budget.active,
      createdAt,
      updatedAt: createdAt
    });
  }

  console.log(`Seeded ${fixtures.length} German-language receipt fixtures, ${demoItems.length} pantry items, and ${demoBudgets.length} budgets into the local Firestore emulator (${projectId}).`);
} finally {
  await app.delete();
}
