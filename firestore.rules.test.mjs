import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

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
    await setDoc(doc(database, "userAccounts/owner"), { householdId: "main", homeHouseholdId: "main" });
    await setDoc(doc(database, "userAccounts/partner"), { householdId: "main", homeHouseholdId: null });
    await setDoc(doc(database, "userAccounts/isolated-owner"), {
      householdId: "isolated-owner",
      homeHouseholdId: "isolated-owner"
    });
    await setDoc(doc(database, "kitchen/main"), {
      ...settings,
      ownerUid: "owner",
      members: { owner: "owner", partner: "member" },
      memberProfiles: {
        owner: { displayName: "Owner", photoURL: "" },
        partner: { displayName: "Partner", photoURL: "" }
      }
    });
    await setDoc(doc(database, "kitchen/isolated-owner"), {
      ...settings,
      ownerUid: "isolated-owner",
      members: { "isolated-owner": "owner" },
      memberProfiles: { "isolated-owner": { displayName: "Solo owner", photoURL: "" } }
    });
    await setDoc(doc(database, "kitchen/isolated-owner/items/private-item"), {
      name: "Private apples",
      quantity: 1,
      category: "Groceries",
      state: "inStock"
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
  const unverifiedMember = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: false
  }).firestore();

  await assertSucceeds(getDoc(doc(member, "kitchen/main/items/item-1")));
  await assertFails(getDoc(doc(outsider, "kitchen/main/items/item-1")));
  await assertFails(getDoc(doc(unverifiedMember, "kitchen/main/items/item-1")));
});

test("item deletion can be undone only within one minute and cannot be bypassed", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: true
  }).firestore();
  const ref = doc(member, "kitchen/main/items/delete-test");
  await assertSucceeds(setDoc(ref, { name: "Test", quantity: 1, category: "Groceries", state: "toBuy" }));
  await assertFails(deleteDoc(ref));
  await assertFails(updateDoc(ref, { deletedAt: new Date(0) }));
  await assertSucceeds(updateDoc(ref, { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { name: "Changed" }));
  await assertSucceeds(updateDoc(ref, { deletedAt: deleteField(), updatedAt: serverTimestamp() }));
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "kitchen/main/items/delete-test"), {
      deletedAt: new Date(Date.now() - 61_000)
    });

  });
  await assertFails(updateDoc(ref, { deletedAt: deleteField(), updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(ref));
});

test("item quantities and stock baselines accept valid decimals", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test", email_verified: true
  }).firestore();
  const ref = doc(member, "kitchen/main/items/stock-baseline-test");
  await assertSucceeds(setDoc(ref, { name: "Oranges", quantity: 10, stockBaseline: 10, category: "Groceries", state: "inStock" }));
  await assertSucceeds(updateDoc(ref, { quantity: 2 }));
  await assertSucceeds(updateDoc(ref, { quantity: 0.25, stockBaseline: 0.5 }));
  await assertFails(updateDoc(ref, { quantity: -0.1 }));
  await assertFails(updateDoc(ref, { quantity: 10000 }));
  await assertFails(updateDoc(ref, { quantity: "0.5" }));
  await assertFails(updateDoc(ref, { stockBaseline: -1 }));
  await assertFails(updateDoc(ref, { stockBaseline: "0.5" }));
  await assertFails(updateDoc(ref, { stockBaseline: 10000 }));
});

test("household notifications are readable and only their read flag can be changed", async () => {
  const member = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test", email_verified: true
  }).firestore();
  const outsider = testEnvironment.authenticatedContext("outsider", {
    email: "outsider@example.test", email_verified: true
  }).firestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "kitchen/main/alerts/test-alert"), {
      budgetName: "Food", thresholdPercent: 100, read: false
    });
  });
  const ref = doc(member, "kitchen/main/alerts/test-alert");
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { read: true }));
  await assertFails(updateDoc(ref, { thresholdPercent: 70 }));
  await assertFails(setDoc(doc(member, "kitchen/main/alerts/fake"), { read: false }));
  await assertFails(getDoc(doc(outsider, "kitchen/main/alerts/test-alert")));
  await assertFails(updateDoc(doc(outsider, "kitchen/main/alerts/test-alert"), { read: true }));
});

test("household owners are isolated and cannot change their active household", async () => {
  const soloOwner = testEnvironment.authenticatedContext("isolated-owner", {
    email: "solo@example.test",
    email_verified: true
  }).firestore();
  const partner = testEnvironment.authenticatedContext("partner", {
    email: "partner@example.test",
    email_verified: true
  }).firestore();

  await assertSucceeds(getDoc(doc(soloOwner, "kitchen/isolated-owner/items/private-item")));
  await assertFails(getDoc(doc(soloOwner, "kitchen/main/items/item-1")));
  await assertFails(getDoc(doc(partner, "kitchen/isolated-owner/items/private-item")));
  await assertFails(updateDoc(doc(soloOwner, "userAccounts/isolated-owner"), {
    householdId: "main"
  }));
});

test("a user can read only their own household mapping", async () => {
  const owner = testEnvironment.authenticatedContext("owner", {
    email: "owner@example.test",
    email_verified: false
  }).firestore();
  const outsider = testEnvironment.authenticatedContext("outsider", {
    email: "outsider@example.test",
    email_verified: true
  }).firestore();

  await assertSucceeds(getDoc(doc(owner, "userAccounts/owner")));
  await assertFails(getDoc(doc(outsider, "userAccounts/owner")));
});

test("a verified user can create only their own personal household", async () => {
  const soloOwner = testEnvironment.authenticatedContext("new-owner", {
    email: "new-owner@example.test",
    email_verified: true
  }).firestore();
  const batch = writeBatch(soloOwner);
  batch.set(doc(soloOwner, "userAccounts/new-owner"), {
    householdId: "new-owner",
    homeHouseholdId: "new-owner"
  });
  batch.set(doc(soloOwner, "kitchen/new-owner"), {
    ...settings,
    ownerUid: "new-owner",
    members: { "new-owner": "owner" },
    memberProfiles: { "new-owner": { displayName: "New owner", photoURL: "" } }
  });

  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(soloOwner, "kitchen/new-owner")));
  await assertFails(setDoc(doc(soloOwner, "userAccounts/other"), {
    householdId: "other",
    homeHouseholdId: "other"
  }));
  await assertFails(setDoc(doc(soloOwner, "kitchen/other"), {
    ...settings,
    ownerUid: "new-owner",
    members: { "new-owner": "owner" },
    memberProfiles: { "new-owner": { displayName: "New owner", photoURL: "" } }
  }));
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
