import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { purgeDeletedItems } from "../lib/functions/src/deletedItems.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== "demo-my-kitchen") {
  throw new Error("This test must run against the demo Firestore emulator.");
}

const app = initializeApp({ projectId: "demo-my-kitchen" });
const db = getFirestore(app);
const expired = db.doc("kitchen/cleanup-test/items/expired");
const recent = db.doc("kitchen/cleanup-test/items/recent");
const restored = db.doc("kitchen/cleanup-test/items/restored");
const unrelated = db.doc("other/test/items/unrelated");

before(async () => {
  await Promise.all([
    expired.set({ deletedAt: Timestamp.fromMillis(Date.now() - 61_000) }),
    recent.set({ deletedAt: Timestamp.now() }),
    restored.set({ name: "Restored" }),
    unrelated.set({ deletedAt: Timestamp.fromMillis(Date.now() - 61_000) })
  ]);
});

after(async () => {
  await deleteApp(app);
});

test("cleanup deletes expired kitchen items only", async () => {
  await purgeDeletedItems();
  assert.equal((await expired.get()).exists, false);
  assert.equal((await recent.get()).exists, true);
  assert.equal((await restored.get()).exists, true);
  assert.equal((await unrelated.get()).exists, true);
});
