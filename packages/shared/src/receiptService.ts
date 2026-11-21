import {
  collection,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore
} from "firebase/firestore";
import { getKitchenDocPath } from "./constants.js";
import { isUnreceiptedPurchase } from "./itemViews.js";
import type { ReceiptDraft } from "./types.js";

function receiptCollection(db: Firestore) {
  return collection(db, `${getKitchenDocPath()}/receipts`);
}

export async function createReceipt(db: Firestore, receipt: ReceiptDraft, itemIds: readonly string[] = []): Promise<string> {
  const ids = [...new Set(itemIds)];
  if (ids.length > 499) throw new Error("A receipt can include at most 499 purchased items.");
  const ref = doc(receiptCollection(db));
  const items = ids.map((id) => doc(db, `${getKitchenDocPath()}/items`, id));
  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(items.map((item) => transaction.get(item)));
    for (const snapshot of snapshots) {
      const boughtAt: unknown = snapshot.get("boughtAt");
      if (!snapshot.exists() || snapshot.get("deletedAt")
        || (boughtAt != null && !(boughtAt instanceof Timestamp))
        || !isUnreceiptedPurchase({
          bought: snapshot.get("bought"),
          boughtAt: boughtAt ?? null,
          receiptRecorded: snapshot.get("receiptRecorded"),
          receiptRestored: snapshot.get("receiptRestored")
        })) {
        throw new Error("A selected purchase is no longer available. Refresh and select the purchases again.");
      }
    }
    transaction.set(ref, {
      ...receipt, purchaseItemIds: ids,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    for (const [index, item] of items.entries()) {
      transaction.update(item, {
        receiptRecorded: true, receiptId: ref.id,
        receiptBoughtAt: snapshots[index]!.get("boughtAt") ?? null,
        receiptRestored: deleteField(), updatedAt: serverTimestamp()
      });
    }
  });
  return ref.id;
}

export async function updateReceipt(
  db: Firestore,
  receiptId: string,
  receipt: ReceiptDraft
): Promise<void> {
  await updateDoc(doc(receiptCollection(db), receiptId), {
    ...receipt,
    updatedAt: serverTimestamp()
  });
}

export async function deleteReceipt(db: Firestore, receiptId: string): Promise<{ restored: number; legacy: boolean }> {
  const ref = doc(receiptCollection(db), receiptId);
  return runTransaction(db, async (transaction) => {
    const receipt = await transaction.get(ref);
    if (!receipt.exists()) throw new Error("This receipt no longer exists.");
    const ids: unknown = receipt.get("purchaseItemIds");
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 499 || ids.some((id) => typeof id !== "string" || !id || id.includes("/")) || new Set(ids).size !== ids.length)) {
      throw new Error("This receipt has invalid purchase associations and cannot be deleted safely.");
    }
    const refs = (ids ?? []).map((id: string) => doc(db, `${getKitchenDocPath()}/items`, id));
    const snapshots = await Promise.all(refs.map((item) => transaction.get(item)));
    let restored = 0;
    snapshots.forEach((snapshot, index) => {
      const currentBoughtAt: unknown = snapshot.get("boughtAt");
      const receiptBoughtAt: unknown = snapshot.get("receiptBoughtAt");
      const samePurchase = currentBoughtAt == null && receiptBoughtAt === null
        || currentBoughtAt instanceof Timestamp && receiptBoughtAt instanceof Timestamp && currentBoughtAt.isEqual(receiptBoughtAt);
      if (snapshot.exists() && !snapshot.get("deletedAt") && snapshot.get("bought") === true
        && snapshot.get("receiptRecorded") === true && snapshot.get("receiptId") === receiptId && samePurchase) {
        transaction.update(refs[index]!, {
          receiptRecorded: false, receiptRestored: true, receiptId: deleteField(), receiptBoughtAt: deleteField(), updatedAt: serverTimestamp()
        });
        restored += 1;
      }
    });
    transaction.delete(ref);
    return { restored, legacy: ids === undefined };
  });
}
