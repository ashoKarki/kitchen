import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore
} from "firebase/firestore";

interface HouseholdBootstrapResult {
  householdId: string;
  status: "owner" | "member";
}

export function householdBootstrapErrorMessage(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && String(error.code) === "permission-denied"
  ) {
    return "Firestore blocked household setup. Deploy the updated Firestore rules, then try again.";
  }
  return error instanceof Error ? error.message : String(error);
}

function memberSettings() {
  return {
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

export async function bootstrapPersonalHousehold(
  db: Firestore,
  uid: string,
  profile: { displayName: string; photoURL: string }
): Promise<HouseholdBootstrapResult> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new Error("The signed-in account identifier is invalid.");
  }
  const accountRef = doc(db, `userAccounts/${uid}`);
  const result = await runTransaction(db, async (transaction) => {
    const account = await transaction.get(accountRef);
    if (account.exists()) {
      const householdId: unknown = account.get("householdId");
      if (typeof householdId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(householdId)) {
        throw new Error("This account has an invalid household association.");
      }
      const kitchen = await transaction.get(doc(db, `kitchen/${householdId}`));
      const members: unknown = kitchen.get("members");
      const role = typeof members === "object" && members !== null && !Array.isArray(members)
        ? Reflect.get(members, uid)
        : null;
      if (!kitchen.exists() || (role !== "owner" && role !== "member")) {
        throw new Error("This account is no longer a member of its active household.");
      }
      return { householdId, status: role };
    }

    const householdId = uid;
    const kitchenRef = doc(db, `kitchen/${householdId}`);
    const kitchen = await transaction.get(kitchenRef);
    if (kitchen.exists()) {
      throw new Error("A personal household already exists but is not linked to this account.");
    }
    transaction.set(accountRef, {
      householdId,
      homeHouseholdId: householdId
    });
    transaction.set(kitchenRef, {
      reminderEnabled: true,
      reminderHour: 9,
      timeZone: "UTC",
      budgetAlertsEnabled: true,
      discretionaryCategories: ["Cafe & Eating out", "Snacks & Sweets", "Alcohol", "Tobacco"],
      ownerUid: uid,
      members: { [uid]: "owner" },
      memberProfiles: { [uid]: profile }
    });
    return { householdId, status: "owner" };
  });

  const memberSettingsRef = doc(db, `kitchen/${result.householdId}/memberSettings/${uid}`);
  if (!(await getDoc(memberSettingsRef)).exists()) {
    await setDoc(memberSettingsRef, memberSettings());
  }
  return result;
}
