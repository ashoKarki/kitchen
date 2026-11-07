import { collection, doc, updateDoc, type Firestore } from "firebase/firestore";
import { getKitchenDocPath } from "./constants.js";

export async function markBudgetAlertRead(
  db: Firestore,
  alertId: string,
  read = true
): Promise<void> {
  await updateDoc(doc(collection(db, `${getKitchenDocPath()}/alerts`), alertId), { read });
}
