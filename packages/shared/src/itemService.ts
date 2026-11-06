import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore
} from "firebase/firestore";
import { KITCHEN_DOC_PATH } from "./constants.js";
import type { KitchenItemUpdate, NewKitchenItem } from "./types.js";

function itemCollection(db: Firestore) {
  return collection(db, `${KITCHEN_DOC_PATH}/items`);
}

export async function createItem(db: Firestore, item: NewKitchenItem): Promise<string> {
  const created = await addDoc(itemCollection(db), {
    ...item,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return created.id;
}

export async function updateItem(
  db: Firestore,
  itemId: string,
  changes: KitchenItemUpdate
): Promise<void> {
  await updateDoc(doc(itemCollection(db), itemId), {
    ...changes,
    updatedAt: serverTimestamp()
  });
}

export async function setItemBought(
  db: Firestore,
  itemId: string,
  bought: boolean,
  state?: "inStock" | "finished" | "toBuy"
): Promise<void> {
  await updateDoc(doc(itemCollection(db), itemId), {
    bought,
    boughtAt: bought ? serverTimestamp() : null,
    receiptRecorded: false,
    ...(state ? { state } : {}),
    updatedAt: serverTimestamp()
  });
}

export async function markItemsReceiptRecorded(db: Firestore, itemIds: readonly string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const batch = writeBatch(db);
  for (const itemId of itemIds) {
    batch.update(doc(itemCollection(db), itemId), {
      receiptRecorded: true,
      updatedAt: serverTimestamp()
    });
  }
  await batch.commit();
}

export async function completeShoppingList(
  db: Firestore,
  itemIds: readonly string[],
  newlyBoughtItemId: string
): Promise<void> {
  for (let start = 0; start < itemIds.length; start += 500) {
    const batch = writeBatch(db);
    for (const itemId of itemIds.slice(start, start + 500)) {
      batch.update(doc(itemCollection(db), itemId), {
        state: "inStock",
        bought: true,
        ...(itemId === newlyBoughtItemId
          ? { boughtAt: serverTimestamp(), receiptRecorded: false }
          : {}),
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  }
}

export async function deleteItem(db: Firestore, itemId: string): Promise<void> {
  await deleteDoc(doc(itemCollection(db), itemId));
}
