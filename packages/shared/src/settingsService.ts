import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore
} from "firebase/firestore";
import { DEFAULT_SETTINGS, KITCHEN_DOC_PATH } from "./constants.js";
import type { KitchenSettings } from "./types.js";

export function settingsDocument(db: Firestore) {
  return doc(db, KITCHEN_DOC_PATH);
}

export async function ensureSettings(db: Firestore, timeZone: string): Promise<void> {
  const reference = settingsDocument(db);
  const existing = await getDoc(reference);

  if (!existing.exists()) {
    await setDoc(reference, {
      ...DEFAULT_SETTINGS,
      timeZone
    }, { merge: true });
    return;
  }

  const changes: Partial<KitchenSettings> = {};
  if (existing.get("reminderEnabled") === undefined) changes.reminderEnabled = DEFAULT_SETTINGS.reminderEnabled;
  if (existing.get("reminderHour") === undefined) changes.reminderHour = DEFAULT_SETTINGS.reminderHour;
  if (existing.get("timeZone") !== timeZone) changes.timeZone = timeZone;
  if (existing.get("budgetAlertsEnabled") === undefined) {
    changes.budgetAlertsEnabled = DEFAULT_SETTINGS.budgetAlertsEnabled;
  }
  if (existing.get("discretionaryCategories") === undefined) {
    changes.discretionaryCategories = [...DEFAULT_SETTINGS.discretionaryCategories];
  }
  if (Object.keys(changes).length > 0) {
    await setDoc(reference, changes, { merge: true });
  }
}

export async function updateSettings(
  db: Firestore,
  changes: Partial<KitchenSettings>
): Promise<void> {
  await updateDoc(settingsDocument(db), {
    ...changes
  });
}
