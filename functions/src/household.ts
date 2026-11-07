import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineBoolean, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireMember, requireOwner, requireVerifiedUser } from "./auth.js";

const allowedEmails = defineString("ALLOWED_EMAILS", { default: "" });
export const enforceAppCheck = defineBoolean("ENFORCE_APP_CHECK", { default: false });
const inviteCodeSchema = /^[A-Za-z0-9_-]{20,100}$/;

function inviteHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function memberSettingsFromKitchen(settings: Record<string, unknown>) {
  return {
    reminderEnabled: settings.reminderEnabled ?? true,
    reminderHour: settings.reminderHour ?? 9,
    budgetAlertsEnabled: settings.budgetAlertsEnabled ?? true,
    expiryWarnDays: 3,
    weeklySummaryEnabled: false,
    language: "en",
    theme: "system",
    diet: [],
    dislikes: [],
    servings: 2,
    maxCookingTimeMinutes: 45,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

function requestedMemberUid(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", "Select a valid household member.");
  }
  return value;
}

function profileFromRequest(request: Parameters<typeof requireVerifiedUser>[0]): {
  displayName: string;
  photoURL: string;
} {
  const name: unknown = request.auth?.token.name;
  const photo: unknown = request.auth?.token.picture;
  return {
    displayName: typeof name === "string" ? name.slice(0, 100) : "",
    photoURL: typeof photo === "string" ? photo.slice(0, 2048) : ""
  };
}

export const bootstrapKitchen = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const user = requireVerifiedUser(request);
    const db = getFirestore();
    const accountRef = db.doc(`userAccounts/${user.uid}`);
    const legacyKitchenRef = db.doc("kitchen/main");
    const personalKitchenRef = db.doc(`kitchen/${user.uid}`);
    const profile = profileFromRequest(request);
    const allowed = new Set(
      allowedEmails.value().split(",").map((email) => email.trim().toLocaleLowerCase()).filter(Boolean)
    );

    return db.runTransaction(async (transaction) => {
      const account = await transaction.get(accountRef);
      if (account.exists) {
        const kitchenId: unknown = account.get("householdId");
        if (typeof kitchenId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(kitchenId)) {
          throw new HttpsError("failed-precondition", "This account has an invalid household association.");
        }
        const kitchenRef = db.doc(`kitchen/${kitchenId}`);
        const kitchen = await transaction.get(kitchenRef);
        const members: unknown = kitchen.get("members");
        const role = typeof members === "object" && members !== null && !Array.isArray(members)
          ? Reflect.get(members, user.uid)
          : null;
        if ((role === "owner" || role === "member") && kitchen.exists) {
          const memberSettingsRef = kitchenRef.collection("memberSettings").doc(user.uid);
          const memberSettings = await transaction.get(memberSettingsRef);
          if (!memberSettings.exists) {
            transaction.set(memberSettingsRef, memberSettingsFromKitchen(kitchen.data() ?? {}));
          }
          return { status: role, householdId: kitchenId };
        }
        throw new HttpsError("failed-precondition", "This account is no longer a member of its active household.");
      }

      const legacyKitchen = await transaction.get(legacyKitchenRef);
      const personalKitchen = await transaction.get(personalKitchenRef);
      const legacyMembers: unknown = legacyKitchen.get("members");
      const legacyRole = typeof legacyMembers === "object" && legacyMembers !== null && !Array.isArray(legacyMembers)
        ? Reflect.get(legacyMembers, user.uid)
        : null;

      if (legacyRole === "owner" || legacyRole === "member") {
        const memberSettingsRef = legacyKitchenRef.collection("memberSettings").doc(user.uid);
        const memberSettings = await transaction.get(memberSettingsRef);
        if (!memberSettings.exists) {
          transaction.set(memberSettingsRef, memberSettingsFromKitchen(legacyKitchen.data() ?? {}));
        }
        transaction.set(accountRef, {
          householdId: "main",
          homeHouseholdId: legacyRole === "owner" ? "main" : null
        });
        return { status: legacyRole, householdId: "main" };
      }

      const legacyHasMembers = typeof legacyMembers === "object"
        && legacyMembers !== null
        && !Array.isArray(legacyMembers)
        && Object.keys(legacyMembers).length > 0;
      if (!legacyHasMembers && allowed.has(user.email)) {
        const memberSettingsRef = legacyKitchenRef.collection("memberSettings").doc(user.uid);
        transaction.set(legacyKitchenRef, {
          ownerUid: user.uid,
          members: { [user.uid]: "owner" },
          memberProfiles: { [user.uid]: profile }
        }, { merge: true });
        transaction.set(memberSettingsRef, memberSettingsFromKitchen(legacyKitchen.data() ?? {}), { merge: true });
        transaction.set(accountRef, { householdId: "main", homeHouseholdId: "main" });
        return { status: "owner", householdId: "main" };
      }

      if (personalKitchen.exists) {
        const members: unknown = personalKitchen.get("members");
        const role = typeof members === "object" && members !== null && !Array.isArray(members)
          ? Reflect.get(members, user.uid)
          : null;
        if (role !== "owner") {
          throw new HttpsError("failed-precondition", "The personal household already exists in an invalid state.");
        }
      } else {
        transaction.set(personalKitchenRef, {
          reminderEnabled: true,
          reminderHour: 9,
          timeZone: "UTC",
          budgetAlertsEnabled: true,
          discretionaryCategories: ["Cafe & Eating out", "Snacks & Sweets", "Alcohol", "Tobacco"],
          ownerUid: user.uid,
          members: { [user.uid]: "owner" },
          memberProfiles: { [user.uid]: profile }
        });
      }
      transaction.set(personalKitchenRef.collection("memberSettings").doc(user.uid), {
        ...memberSettingsFromKitchen(personalKitchen.data() ?? {}),
        ...(personalKitchen.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
      }, { merge: true });
      transaction.set(accountRef, {
        householdId: user.uid,
        homeHouseholdId: user.uid
      });
      return { status: "owner", householdId: user.uid };
    });
  }
);

export const createInvite = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const owner = await requireOwner(request);
    const email: unknown = request.data?.email;
    if (email !== undefined && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    const code = randomBytes(32).toString("base64url");
    const db = getFirestore();
    await db.collection("invites").doc(inviteHash(code)).create({
      householdId: owner.householdId,
      emailHash: typeof email === "string"
        ? createHash("sha256").update(email.trim().toLocaleLowerCase()).digest("hex")
        : null,
      createdBy: owner.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });
    return { code };
  }
);

export const joinHousehold = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const user = requireVerifiedUser(request);
    const code: unknown = request.data?.code;
    if (typeof code !== "string" || !inviteCodeSchema.test(code)) {
      throw new HttpsError("invalid-argument", "Enter a valid invitation code.");
    }

    const db = getFirestore();
    const inviteRef = db.collection("invites").doc(inviteHash(code));
    const accountRef = db.doc(`userAccounts/${user.uid}`);
    const profile = profileFromRequest(request);
    return db.runTransaction(async (transaction) => {
      const invite = await transaction.get(inviteRef);
      if (!invite.exists) {
        throw new HttpsError("permission-denied", "This invitation is invalid or has already been used.");
      }
      const kitchenId: unknown = invite.get("householdId");
      if (typeof kitchenId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(kitchenId)) {
        throw new HttpsError("failed-precondition", "This invitation does not reference a valid household.");
      }
      const kitchenRef = db.doc(`kitchen/${kitchenId}`);
      const memberSettingsRef = kitchenRef.collection("memberSettings").doc(user.uid);
      const kitchen = await transaction.get(kitchenRef);
      const account = await transaction.get(accountRef);
      if (!kitchen.exists || !account.exists) {
        throw new HttpsError("permission-denied", "This invitation is invalid or has already been used.");
      }
      const oldHouseholdId: unknown = account.get("householdId");
      const homeHouseholdId: unknown = account.get("homeHouseholdId");
      const oldKitchenRef = typeof oldHouseholdId === "string"
        && oldHouseholdId !== kitchenId
        && /^[A-Za-z0-9_-]{1,128}$/.test(oldHouseholdId)
        ? db.doc(`kitchen/${oldHouseholdId}`)
        : null;
      const oldKitchen = oldKitchenRef ? await transaction.get(oldKitchenRef) : null;
      const oldDevices = oldKitchenRef
        ? await transaction.get(oldKitchenRef.collection("devices").where("uid", "==", user.uid))
        : null;
      const expiresAt = invite.get("expiresAt");
      if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) {
        throw new HttpsError("deadline-exceeded", "This invitation has expired.");
      }
      const emailHash: unknown = invite.get("emailHash");
      if (
        emailHash !== null
        && emailHash !== createHash("sha256").update(user.email).digest("hex")
      ) {
        throw new HttpsError("permission-denied", "This invitation belongs to a different Google account.");
      }
      const members: unknown = kitchen.get("members");
      if (typeof members !== "object" || members === null || Array.isArray(members)) {
        throw new HttpsError("failed-precondition", "The kitchen owner must finish setup before you can join.");
      }
      const existingRole = Reflect.get(members, user.uid);
      if (existingRole === "owner" || existingRole === "member") {
        throw new HttpsError("already-exists", "This account is already a member of this household.");
      }
      if (oldHouseholdId === kitchenId) {
        throw new HttpsError("already-exists", "This account is already using this household.");
      }
      if (
        oldKitchenRef
        && oldKitchen?.exists
        && homeHouseholdId !== oldHouseholdId
      ) {
        const oldMembers: unknown = oldKitchen.get("members");
        if (
          typeof oldMembers === "object"
          && oldMembers !== null
          && !Array.isArray(oldMembers)
          && (Reflect.get(oldMembers, user.uid) === "owner" || Reflect.get(oldMembers, user.uid) === "member")
        ) {
          transaction.update(oldKitchenRef, {
            [`members.${user.uid}`]: FieldValue.delete(),
            [`memberProfiles.${user.uid}`]: FieldValue.delete()
          });
          transaction.delete(oldKitchenRef.collection("memberSettings").doc(user.uid));
        }
      }
      for (const device of oldDevices?.docs ?? []) transaction.delete(device.ref);
      transaction.update(kitchenRef, {
        [`members.${user.uid}`]: "member",
        [`memberProfiles.${user.uid}`]: profile
      });
      transaction.set(
        memberSettingsRef,
        memberSettingsFromKitchen(kitchen.data() ?? {})
      );
      transaction.update(accountRef, { householdId: kitchenId });
      transaction.delete(inviteRef);
      return { status: "member", householdId: kitchenId };
    });
  }
);

export const listHouseholdMembers = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const owner = await requireOwner(request);
    const kitchen = await getFirestore().doc(`kitchen/${owner.householdId}`).get();
    const members: unknown = kitchen.get("members");
    const profiles: unknown = kitchen.get("memberProfiles");
    if (typeof members !== "object" || members === null || Array.isArray(members)) {
      return { members: [] };
    }
    return {
      members: Object.entries(members).map(([uid, role]) => {
        const profile = typeof profiles === "object" && profiles !== null
          ? Reflect.get(profiles, uid)
          : null;
        const record = typeof profile === "object" && profile !== null ? profile : {};
        return {
          uid,
          role,
          displayName: Reflect.get(record, "displayName") ?? "",
          photoURL: Reflect.get(record, "photoURL") ?? ""
        };
      })
    };
  }
);

export const removeHouseholdMember = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const owner = await requireOwner(request);
    const uid = requestedMemberUid(request.data?.uid);
    if (uid === owner.uid) {
      throw new HttpsError("invalid-argument", "Select a non-owner household member.");
    }
    const db = getFirestore();
    const kitchenRef = db.doc(`kitchen/${owner.householdId}`);
    const memberSettingsRef = kitchenRef.collection("memberSettings").doc(uid);
    await db.runTransaction(async (transaction) => {
      const kitchen = await transaction.get(kitchenRef);
      const members: unknown = kitchen.get("members");
      if (typeof members !== "object" || members === null || Array.isArray(members) || Reflect.get(members, uid) !== "member") {
        throw new HttpsError("not-found", "Household member not found.");
      }
      const devices = await transaction.get(
        kitchenRef.collection("devices").where("uid", "==", uid)
      );
      transaction.update(kitchenRef, {
        [`members.${uid}`]: FieldValue.delete(),
        [`memberProfiles.${uid}`]: FieldValue.delete()
      });
      transaction.delete(memberSettingsRef);
      for (const device of devices.docs) transaction.delete(device.ref);
    });
    return { status: "removed" };
  }
);

export const transferOwnership = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const owner = await requireOwner(request);
    const uid = requestedMemberUid(request.data?.uid);
    if (uid === owner.uid) {
      throw new HttpsError("invalid-argument", "Select another household member.");
    }
    const kitchenRef = getFirestore().doc(`kitchen/${owner.householdId}`);
    await getFirestore().runTransaction(async (transaction) => {
      const kitchen = await transaction.get(kitchenRef);
      const members: unknown = kitchen.get("members");
      if (typeof members !== "object" || members === null || Array.isArray(members) || Reflect.get(members, uid) !== "member") {
        throw new HttpsError("not-found", "Household member not found.");
      }
      transaction.update(kitchenRef, {
        ownerUid: uid,
        [`members.${owner.uid}`]: "member",
        [`members.${uid}`]: "owner"
      });
    });
    return { status: "transferred" };
  }
);

export const leaveHousehold = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const member = await requireMember(request);
    if (member.role === "owner") {
      throw new HttpsError("failed-precondition", "Transfer ownership before leaving the kitchen.");
    }
    const db = getFirestore();
    const kitchenRef = db.doc(`kitchen/${member.householdId}`);
    const accountRef = db.doc(`userAccounts/${member.uid}`);
    await db.runTransaction(async (transaction) => {
      const account = await transaction.get(accountRef);
      const kitchen = await transaction.get(kitchenRef);
      const homeHouseholdId: unknown = account.get("homeHouseholdId");
      const homeKitchenRef = typeof homeHouseholdId === "string"
        && homeHouseholdId !== member.householdId
        && /^[A-Za-z0-9_-]{1,128}$/.test(homeHouseholdId)
        ? db.doc(`kitchen/${homeHouseholdId}`)
        : null;
      const homeKitchen = homeKitchenRef ? await transaction.get(homeKitchenRef) : null;
      const members: unknown = kitchen.get("members");
      if (
        typeof members !== "object"
        || members === null
        || Array.isArray(members)
        || Reflect.get(members, member.uid) !== "member"
      ) {
        throw new HttpsError("permission-denied", "This account is no longer a kitchen member.");
      }
      const devices = await transaction.get(
        kitchenRef.collection("devices").where("uid", "==", member.uid)
      );
      transaction.update(kitchenRef, {
        [`members.${member.uid}`]: FieldValue.delete(),
        [`memberProfiles.${member.uid}`]: FieldValue.delete()
      });
      transaction.delete(kitchenRef.collection("memberSettings").doc(member.uid));
      for (const device of devices.docs) transaction.delete(device.ref);
      if (homeKitchenRef && homeKitchen?.exists) {
        const homeMembers: unknown = homeKitchen.get("members");
        if (
          typeof homeMembers !== "object"
          || homeMembers === null
          || Array.isArray(homeMembers)
          || Reflect.get(homeMembers, member.uid) !== "owner"
        ) {
          throw new HttpsError("failed-precondition", "Your personal household is no longer available.");
        }
        transaction.update(accountRef, { householdId: homeHouseholdId });
      } else {
        transaction.delete(accountRef);
      }
    });
    const account = await accountRef.get();
    const householdId: unknown = account.get("householdId");
    return typeof householdId === "string"
      ? { status: "owner", householdId }
      : { status: "left" };
  }
);

export const deleteMyAccount = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    const member = await requireMember(request);
    if (member.role === "owner") {
      throw new HttpsError("failed-precondition", "The owner must transfer ownership before deleting this account.");
    }
    const db = getFirestore();
    const kitchenRef = db.doc(`kitchen/${member.householdId}`);
    await db.runTransaction(async (transaction) => {
      const kitchen = await transaction.get(kitchenRef);
      const members: unknown = kitchen.get("members");
      if (
        typeof members !== "object"
        || members === null
        || Array.isArray(members)
        || Reflect.get(members, member.uid) !== "member"
      ) {
        throw new HttpsError("permission-denied", "This account is no longer a kitchen member.");
      }
      const devices = await transaction.get(
        kitchenRef.collection("devices").where("uid", "==", member.uid)
      );
      transaction.update(kitchenRef, {
        [`members.${member.uid}`]: FieldValue.delete(),
        [`memberProfiles.${member.uid}`]: FieldValue.delete()
      });
      transaction.delete(kitchenRef.collection("memberSettings").doc(member.uid));
      for (const device of devices.docs) transaction.delete(device.ref);
    });
    await db.doc(`userAccounts/${member.uid}`).delete();
    await getAuth().deleteUser(member.uid);
    return { status: "deleted" };
  }
);
