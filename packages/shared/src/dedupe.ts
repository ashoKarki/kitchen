import { normalizeGermanName } from "./classify.js";

export function dedupeHash(storeName: string, purchaseDateKey: string, totalCents: number): string {
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError("totalCents must be a safe integer");
  }
  const value = `${normalizeGermanName(storeName)}|${purchaseDateKey}|${totalCents}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
