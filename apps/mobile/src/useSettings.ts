import { useCallback, useEffect, useState } from "react";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { ensureSettings, expenseCategories, KITCHEN_DOC_PATH } from "@my-kitchen/shared";
import type { KitchenSettings } from "@my-kitchen/shared";
import { z } from "zod";
import { getDatabase } from "./firebase";

const settingsSchema = z.object({
  reminderEnabled: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
  timeZone: z.string(),
  budgetAlertsEnabled: z.boolean(),
  discretionaryCategories: z.array(z.enum(expenseCategories))
});

export function useSettings() {
  const [data, setData] = useState<KitchenSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDocFromServer(doc(getDatabase(), KITCHEN_DOC_PATH));
      setData(settingsSchema.parse(snapshot.data()));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    async function subscribe() {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const db = getDatabase();
        await ensureSettings(db, timeZone);
        if (cancelled) return;
        unsubscribe = onSnapshot(doc(db, KITCHEN_DOC_PATH), (snapshot) => {
          try {
            setData(settingsSchema.parse(snapshot.data()));
            setError(null);
            setLoading(false);
          } catch (caught) {
            setData(null);
            setError(caught instanceof Error ? caught.message : String(caught));
            setLoading(false);
          }
        }, (caught) => {
          setData(null);
          setError(caught.message);
          setLoading(false);
        });
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      }
    }
    void subscribe();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return { data, error, loading, refresh };
}
