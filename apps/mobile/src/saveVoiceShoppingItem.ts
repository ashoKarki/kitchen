import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import type { VoiceItem } from "./voiceShoppingQueue";

export async function saveVoiceShoppingItem(db: Firestore, kitchenId: string, item: VoiceItem): Promise<void> {
  const ref = doc(db, "kitchen", kitchenId, "items", `siri_${item.id}`);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return;
    transaction.set(ref, {
      name: item.name,
      quantity: item.quantity,
      category: "Groceries",
      state: "toBuy",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}
