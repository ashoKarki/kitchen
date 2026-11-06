import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const settings = {
  reminderEnabled: true,
  reminderHour: 9,
  timeZone: "Europe/Berlin",
  budgetAlertsEnabled: true,
  discretionaryCategories: ["Cafe & Eating out"]
};
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-my-kitchen",
    firestore: { rules: await readFile(new URL("./firestore.rules", import.meta.url), "utf8") }
  });
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, "kitchen/main"), {
      ...settings,
      ownerUid: "owner",
      members: { owner: "owner", partner: "member" },
      memberProfiles: {
        owner: { displayName: "Owner", photoURL: "" },
        partner: { displayName: "Partner", photoURL: "" }
      }
    });
    await setDoc(doc(database, "kitchen/main/items/item-1"), {
      name: "Apples",
      quantity: 2,
      category: "Groceries",
      state: "inStock"
    });
    await setDoc(doc(database, "kitchen/main/devices/owner-token"), {
      platform: "ios",
      uid: "owner",
      updatedAt: new Date()
    });
    await setDoc(doc(database, "kitchen/main/devices/partner-token"), {
      platform: "android",
      uid: "partner",
      updatedAt: new Date()
    });
    await setDoc(doc(database, "kitchen/main/memberSettings/partner"), {
      reminderEnabled: true,
      reminderHour: 9,
      expiryWarnDays: 3,
      budgetAlertsEnabled: true,
      weeklySummaryEnabled: false,
      language: "en",
      theme: "system",
      diet: [],
      dislikes: [],
      servings: 2,
      maxCookingTimeMinutes: 45,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test("members can access shared kitchen data but non-members cannot", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: true
  }).firestore();
  const outsider = testEnvironment.authenticatedContext("outsider", {
    email: "outsider@example.test",
    email_verified: true
  }).firestore();

  await assertSucceeds(getDoc(doc(member, "kitchen/main/items/item-1")));
  await assertFails(getDoc(doc(outsider, "kitchen/main/items/item-1")));
});

test("members can edit settings and only their own profile, not membership roles", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: true
  }).firestore();
  const kitchen = doc(member, "kitchen/main");

  await assertSucceeds(updateDoc(kitchen, { reminderHour: 10 }));
  await assertSucceeds(updateDoc(kitchen, { "memberProfiles.partner.displayName": "New name" }));
  await assertFails(updateDoc(kitchen, { "memberProfiles.owner.displayName": "Changed" }));
  await assertFails(updateDoc(kitchen, { "members.outsider": "owner" }));
  await assertFails(updateDoc(kitchen, { ownerUid: "partner" }));
});

test("member settings are private to the matching household member", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: true
  }).firestore();
  const owner = testEnvironment.authenticatedContext("owner", {
    email: "owner@example.test",
    email_verified: true
  }).firestore();

  await assertSucceeds(getDoc(doc(member, "kitchen/main/memberSettings/partner")));
  await assertFails(getDoc(doc(member, "kitchen/main/memberSettings/owner")));
  await assertFails(getDoc(doc(owner, "kitchen/main/memberSettings/partner")));
});

test("members can register and remove only their own devices", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: true
  }).firestore();

  await assertSucceeds(setDoc(doc(member, "kitchen/main/devices/new-token"), {
    platform: "ios",
    uid: "partner",
    updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(member, "kitchen/main/devices/other-token"), {
    platform: "ios",
    uid: "owner",
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(doc(member, "kitchen/main/devices/owner-token")));
  await assertSucceeds(deleteDoc(doc(member, "kitchen/main/devices/partner-token")));
});
