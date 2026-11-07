import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export type KitchenRole = "owner" | "member";

export function isVerifiedAccount(email: unknown, emailVerified: unknown): email is string {
  return typeof email === "string" && email.length > 0 && emailVerified === true;
}

export function requireVerifiedUser(request: CallableRequest<unknown>): {
  uid: string;
  email: string;
} {
  const uid = request.auth?.uid;
  const email = request.auth?.token.email;
  if (
    !uid
    || !isVerifiedAccount(email, request.auth?.token.email_verified)
  ) {
    throw new HttpsError("unauthenticated", "Sign in with a verified Google account.");
  }
  return { uid, email: email.toLocaleLowerCase() };
}

export async function requireMember(
  request: CallableRequest<unknown>
): Promise<{ uid: string; email: string; role: KitchenRole; householdId: string }> {
  const user = requireVerifiedUser(request);
  const account = await getFirestore().doc(`userAccounts/${user.uid}`).get();
  const householdId: unknown = account.get("householdId");
  if (!account.exists || typeof householdId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(householdId)) {
    throw new HttpsError("permission-denied", "This account does not have an active household.");
  }
  const snapshot = await getFirestore().doc(`kitchen/${householdId}`).get();
  const members: unknown = snapshot.get("members");
  if (typeof members !== "object" || members === null || Array.isArray(members)) {
    throw new HttpsError("permission-denied", "This app is private.");
  }
  const role = (members as Record<string, unknown>)[user.uid];
  if (role !== "owner" && role !== "member") {
    throw new HttpsError("permission-denied", "This account is not a member of this kitchen.");
  }
  return { ...user, role, householdId };
}

export async function requireOwner(
  request: CallableRequest<unknown>
): Promise<{ uid: string; email: string; role: "owner"; householdId: string }> {
  const member = await requireMember(request);
  if (member.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the kitchen owner can perform this action.");
  }
  return {
    uid: member.uid,
    email: member.email,
    role: "owner",
    householdId: member.householdId
  };
}
