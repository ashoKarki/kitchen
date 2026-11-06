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
    const kitchenRef = db.doc("kitchen/main");
    const memberSettingsRef = kitchenRef.collection("memberSettings").doc(user.uid);
    const profile = profileFromRequest(request);
    const allowed = new Set(
      allowedEmails.value().split(",").map((email) => email.trim().toLocaleLowerCase()).filter(Boolean)
    );

    return db.runTransaction(async (transaction) => {
      const kitchen = await transaction.get(kitchenRef);
      const memberSettings = await transaction.get(memberSettingsRef);
      const currentSettings = kitchen.data() ?? {};
      const currentMembers: unknown = kitchen.get("members");
      if (typeof currentMembers === "object" && currentMembers !== null && !Array.isArray(currentMembers)) {
        const role = Reflect.get(currentMembers, user.uid);
        if (role === "owner" || role === "member") {
          if (!memberSettings.exists) {
            transaction.set(memberSettingsRef, memberSettingsFromKitchen(currentSettings));
          }
          return { status: role };
        }
        if (Object.keys(currentMembers).length > 0) return { status: "private" };
      }

      if (!allowed.has(user.email)) return { status: "private" };

      transaction.set(kitchenRef, {
        ownerUid: user.uid,
        members: { [user.uid]: "owner" },
        memberProfiles: { [user.uid]: profile }
      }, { merge: true });
      transaction.set(memberSettingsRef, memberSettingsFromKitchen(currentSettings), { merge: true });
      return { status: "owner" };
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
    const kitchenRef = db.doc("kitchen/main");
    const inviteRef = db.collection("invites").doc(inviteHash(code));
    const memberSettingsRef = kitchenRef.collection("memberSettings").doc(user.uid);
    const profile = profileFromRequest(request);
    return db.runTransaction(async (transaction) => {
      const invite = await transaction.get(inviteRef);
      const kitchen = await transaction.get(kitchenRef);
      if (!invite.exists || !kitchen.exists) {
        throw new HttpsError("permission-denied", "This invitation is invalid or has already been used.");
      }
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
        throw new HttpsError("already-exists", "This account is already a kitchen member.");
      }
      transaction.update(kitchenRef, {
        [`members.${user.uid}`]: "member",
        [`memberProfiles.${user.uid}`]: profile
      });
      transaction.set(
        memberSettingsRef,
        memberSettingsFromKitchen(kitchen.data() ?? {})
      );
      transaction.delete(inviteRef);
      return { status: "member" };
    });
  }
);

export const listHouseholdMembers = onCall(
  { enforceAppCheck: enforceAppCheck.value() },
  async (request) => {
    await requireOwner(request);
    const kitchen = await getFirestore().doc("kitchen/main").get();
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
    const kitchenRef = db.doc("kitchen/main");
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
    const kitchenRef = getFirestore().doc("kitchen/main");
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
    const kitchenRef = db.doc("kitchen/main");
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
    return { status: "left" };
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
    const kitchenRef = db.doc("kitchen/main");
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
    await getAuth().deleteUser(member.uid);
    return { status: "deleted" };
  }
);
