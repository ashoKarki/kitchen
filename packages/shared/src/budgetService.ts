import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore
} from "firebase/firestore";
import { KITCHEN_DOC_PATH } from "./constants.js";
import type { BudgetDraft } from "./types.js";

function budgetCollection(db: Firestore) {
  return collection(db, `${KITCHEN_DOC_PATH}/budgets`);
}

export async function createBudget(db: Firestore, budget: BudgetDraft): Promise<string> {
  const created = await addDoc(budgetCollection(db), {
    ...budget,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return created.id;
}

export async function updateBudget(
  db: Firestore,
  budgetId: string,
  budget: BudgetDraft
): Promise<void> {
  const reference = doc(budgetCollection(db), budgetId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This budget no longer exists.");
    const alertState: unknown = snapshot.get("alertState");
    transaction.update(reference, {
      ...budget,
      ...(alertState === undefined ? {} : { alertState }),
      updatedAt: serverTimestamp()
    });
  });
}

export async function deleteBudget(db: Firestore, budgetId: string): Promise<void> {
  await deleteDoc(doc(budgetCollection(db), budgetId));
}
