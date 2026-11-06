import { KITCHEN_OWNER_EMAIL } from "../../packages/shared/src/constants.js";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export function isKitchenOwner(email: unknown, emailVerified: unknown): boolean {
  return typeof email === "string"
    && email.toLowerCase() === KITCHEN_OWNER_EMAIL
    && emailVerified === true;
}

export function requireKitchenOwner(request: CallableRequest<unknown>): void {
  if (!isKitchenOwner(request.auth?.token.email, request.auth?.token.email_verified)) {
    throw new HttpsError("permission-denied", "Only the authorized kitchen owner can use this feature.");
  }
}
