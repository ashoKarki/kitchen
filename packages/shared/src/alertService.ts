import { collection, doc, updateDoc, type Firestore } from "firebase/firestore";
import { KITCHEN_DOC_PATH } from "./constants.js";

export async function markBudgetAlertRead(
  db: Firestore,
  alertId: string,
  read = true
): Promise<void> {
  await updateDoc(doc(collection(db, `${KITCHEN_DOC_PATH}/alerts`), alertId), { read });
}
