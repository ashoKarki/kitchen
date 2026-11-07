import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  type Firestore
} from "firebase/firestore";
import { DEFAULT_SETTINGS, getKitchenDocPath } from "./constants.js";
import type { KitchenSettings } from "./types.js";

export function settingsDocument(db: Firestore) {
  return doc(db, getKitchenDocPath());
}

export function memberSettingsDocument(db: Firestore, uid: string) {
  return doc(db, `${getKitchenDocPath()}/memberSettings/${uid}`);
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
  changes: Partial<KitchenSettings>,
  memberUid?: string
): Promise<void> {
  const memberChanges: Partial<Pick<KitchenSettings, "reminderEnabled" | "reminderHour" | "budgetAlertsEnabled">> = {};
  const sharedChanges: Partial<KitchenSettings> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key === "reminderEnabled" || key === "reminderHour" || key === "budgetAlertsEnabled") {
      Object.assign(memberChanges, { [key]: value });
    } else if (key === "timeZone" || key === "discretionaryCategories") {
      Object.assign(sharedChanges, { [key]: value });
    }
  }

  const batch = writeBatch(db);
  if (Object.keys(memberChanges).length > 0) {
    if (!memberUid) throw new Error("A signed-in household member is required to update personal settings.");
    batch.update(memberSettingsDocument(db, memberUid), memberChanges);
  }
  if (Object.keys(sharedChanges).length > 0) {
    batch.update(settingsDocument(db), sharedChanges);
  }
  if (Object.keys(memberChanges).length > 0 || Object.keys(sharedChanges).length > 0) {
    await batch.commit();
  }
}
