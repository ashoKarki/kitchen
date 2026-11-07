import { useCallback, useEffect, useState } from "react";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { ensureSettings, expenseCategories, getKitchenDocPath, memberSettingsDocument } from "@my-kitchen/shared";
import type { KitchenSettings } from "@my-kitchen/shared";
import { z } from "zod";
import { getDatabase, getFirebaseAuth } from "./firebase";
import { useKitchenId } from "./useKitchenPath";

const settingsSchema = z.object({
  reminderEnabled: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
  timeZone: z.string(),
  budgetAlertsEnabled: z.boolean(),
  discretionaryCategories: z.array(z.enum(expenseCategories))
});
const memberSettingsSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  budgetAlertsEnabled: z.boolean().optional()
});

function readMemberSettings(value: unknown): Partial<Pick<KitchenSettings, "reminderEnabled" | "reminderHour" | "budgetAlertsEnabled">> {
  const parsed = memberSettingsSchema.parse(value);
  return {
    ...(parsed.reminderEnabled === undefined ? {} : { reminderEnabled: parsed.reminderEnabled }),
    ...(parsed.reminderHour === undefined ? {} : { reminderHour: parsed.reminderHour }),
    ...(parsed.budgetAlertsEnabled === undefined ? {} : { budgetAlertsEnabled: parsed.budgetAlertsEnabled })
  };
}

export function useSettings() {
  const kitchenId = useKitchenId();
  const [data, setData] = useState<KitchenSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const memberUid = getFirebaseAuth().currentUser?.uid;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDatabase();
      const [snapshot, memberSnapshot] = await Promise.all([
        getDocFromServer(doc(db, getKitchenDocPath())),
        memberUid ? getDocFromServer(memberSettingsDocument(db, memberUid)) : Promise.resolve(null)
      ]);
      const kitchenSettings = settingsSchema.parse(snapshot.data());
      const memberSettings = memberSnapshot?.exists()
        ? readMemberSettings(memberSnapshot.data())
        : {};
      setData({ ...kitchenSettings, ...memberSettings });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [memberUid, kitchenId]);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    let cancelled = false;
    let kitchenSettings: KitchenSettings | null = null;
    let memberSettings: Partial<Pick<KitchenSettings, "reminderEnabled" | "reminderHour" | "budgetAlertsEnabled">> = {};
    const publish = () => {
      if (kitchenSettings) {
        setData({ ...kitchenSettings, ...memberSettings });
        setError(null);
        setLoading(false);
      }
    };
    async function subscribe() {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const db = getDatabase();
        await ensureSettings(db, timeZone);
        if (cancelled) return;
        unsubscribers.push(onSnapshot(doc(db, getKitchenDocPath()), (snapshot) => {
          try {
            kitchenSettings = settingsSchema.parse(snapshot.data());
            publish();
          } catch (caught) {
            setData(null);
            setError(caught instanceof Error ? caught.message : String(caught));
            setLoading(false);
          }
        }, (caught) => {
          setData(null);
          setError(caught.message);
          setLoading(false);
        }));
        if (memberUid) {
          unsubscribers.push(onSnapshot(memberSettingsDocument(db, memberUid), (snapshot) => {
            try {
              memberSettings = snapshot.exists() ? readMemberSettings(snapshot.data()) : {};
              publish();
            } catch (caught) {
              setData(null);
              setError(caught instanceof Error ? caught.message : String(caught));
              setLoading(false);
            }
          }, (caught) => {
            setData(null);
            setError(caught.message);
            setLoading(false);
          }));
        }
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      }
    }
    void subscribe();
    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [memberUid, kitchenId]);

  return { data, error, loading, refresh };
}
