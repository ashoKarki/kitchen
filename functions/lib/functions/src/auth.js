import { KITCHEN_OWNER_EMAIL } from "../../packages/shared/src/constants.js";
import { HttpsError } from "firebase-functions/v2/https";
export function isKitchenOwner(email, emailVerified) {
    return typeof email === "string"
        && email.toLowerCase() === KITCHEN_OWNER_EMAIL
        && emailVerified === true;
}
export function requireKitchenOwner(request) {
    if (!isKitchenOwner(request.auth?.token.email, request.auth?.token.email_verified)) {
        throw new HttpsError("permission-denied", "Only the authorized kitchen owner can use this feature.");
    }
}
