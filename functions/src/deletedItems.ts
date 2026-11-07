import { getFirestore, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

const undoMilliseconds = 60_000;

export async function purgeDeletedItems(): Promise<void> {
  const db = getFirestore();
  const cutoff = Timestamp.fromMillis(Date.now() - undoMilliseconds);
  const query = db.collectionGroup("items").where("deletedAt", "<=", cutoff).orderBy("deletedAt").limit(200);
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    const snapshot = await (cursor ? query.startAfter(cursor) : query).get();
    if (snapshot.empty) return;
    await Promise.all(snapshot.docs.map(async (candidate) => {
      if (!/^kitchen\/[^/]+\/items\/[^/]+$/.test(candidate.ref.path)) return;
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(candidate.ref);
        const deletedAt: unknown = current.get("deletedAt");
        if (deletedAt instanceof Timestamp && deletedAt.toMillis() <= cutoff.toMillis()) {
          transaction.delete(candidate.ref);
        }
      });
    }));
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 200) return;
  }
}

export const purgeExpiredItems = onSchedule(
  { schedule: "* * * * *", maxInstances: 1, timeoutSeconds: 540, retryCount: 3 },
  async () => {
    await purgeDeletedItems();
  }
);
