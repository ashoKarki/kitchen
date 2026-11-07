import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  type Firestore
} from "firebase/firestore";
import { getKitchenDocPath } from "./constants.js";
import type { ReceiptDraft } from "./types.js";

function receiptCollection(db: Firestore) {
  return collection(db, `${getKitchenDocPath()}/receipts`);
}

export async function createReceipt(db: Firestore, receipt: ReceiptDraft): Promise<string> {
  const created = await addDoc(receiptCollection(db), {
    ...receipt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return created.id;
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

export async function deleteReceipt(db: Firestore, receiptId: string): Promise<void> {
  await deleteDoc(doc(receiptCollection(db), receiptId));
}
