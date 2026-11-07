import {
  addDoc,
  collection,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore
} from "firebase/firestore";
import { getKitchenDocPath } from "./constants.js";
import { isValidQuantity, quantityScale, quantityUnits } from "./quantity.js";
import type { KitchenItemUpdate, NewKitchenItem } from "./types.js";

function itemCollection(db: Firestore) {
  return collection(db, `${getKitchenDocPath()}/items`);
}

export async function createItem(db: Firestore, item: NewKitchenItem): Promise<string> {
  const created = await addDoc(itemCollection(db), {
    ...item,
    ...(item.state === "inStock" ? { stockBaseline: item.quantity } : {}),
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
  bought: boolean
): Promise<void> {
  const ref = doc(itemCollection(db), itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This item no longer exists.");
    if (snapshot.get("deletedAt")) throw new Error("This item has been deleted.");
    const quantity: unknown = snapshot.get("quantity");
    if (!isValidQuantity(quantity)) {
      throw new Error("This item has an invalid quantity.");
    }
    transaction.update(ref, {
      bought,
      boughtAt: bought ? serverTimestamp() : null,
      receiptRecorded: false,
      state: bought ? "inStock" : "toBuy",
      ...(bought && quantity === 0 ? { quantity: 1 } : {}),
      ...(bought ? { stockBaseline: quantity === 0 ? 1 : quantity } : {}),
      updatedAt: serverTimestamp()
    });
  });
}

export async function adjustItemQuantity(db: Firestore, itemId: string, delta: number): Promise<void> {
  if (!isValidQuantity(Math.abs(delta)) || delta === 0) {
    throw new Error("Enter an amount above 0 and up to 9999, with at most 9 decimal places.");
  }
  const ref = doc(itemCollection(db), itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This item no longer exists.");
    if (snapshot.get("deletedAt")) throw new Error("This item has been deleted.");
    if (!["inStock", "finished"].includes(snapshot.get("state"))) throw new Error("This item is not in the pantry.");
    const quantity: unknown = snapshot.get("quantity");
    const baseline: unknown = snapshot.get("stockBaseline");
    if (!isValidQuantity(quantity) || (baseline !== undefined && !isValidQuantity(baseline))) {
      throw new Error("This item has an invalid stock quantity.");
    }
    const nextUnits = quantityUnits(quantity) + (delta > 0 ? 1 : -1) * quantityUnits(Math.abs(delta));
    if (nextUnits < 0) throw new Error("Cannot subtract more than the current quantity.");
    if (nextUnits > 9999 * quantityScale) throw new Error("The resulting quantity cannot exceed 9999.");
    const next = nextUnits / quantityScale;
    transaction.update(ref, {
      quantity: next,
      stockBaseline: delta > 0 ? next : (baseline ?? quantity),
      state: next === 0 ? "finished" : "inStock",
      updatedAt: serverTimestamp()
    });
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
  await updateDoc(doc(itemCollection(db), itemId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function undoDeleteItem(db: Firestore, itemId: string): Promise<void> {
  await updateDoc(doc(itemCollection(db), itemId), {
    deletedAt: deleteField(),
    updatedAt: serverTimestamp()
  });
}
