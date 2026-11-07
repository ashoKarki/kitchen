import { useCallback, useEffect, useState } from "react";
import {
  collection,
  getDocsFromServer,
  onSnapshot
} from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { expenseCategories, getKitchenDocPath } from "@my-kitchen/shared";
import type { KitchenItem } from "@my-kitchen/shared";
import { z } from "zod";
import { getDatabase } from "./firebase";
import { useKitchenId } from "./useKitchenPath";

const itemSchema = z.object({
  name: z.string().min(1).max(100),
  quantity: z.number().min(0).max(9999),
  stockBaseline: z.number().min(0).max(9999).optional(),
  category: z.enum(expenseCategories),
  state: z.enum(["inStock", "finished", "toBuy"]),
  bought: z.boolean().optional(),
  boughtAt: z.instanceof(Timestamp).nullable().optional(),
  receiptRecorded: z.boolean().optional(),
  deletedAt: z.instanceof(Timestamp).optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp)
});

export function useItems() {
  const kitchenId = useKitchenId();
  const [data, setData] = useState<Array<{ id: string; item: KitchenItem }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDocsFromServer(collection(getDatabase(), `${getKitchenDocPath()}/items`));
      setData(snapshot.docs.map((entry) => {
        const item = itemSchema.parse(entry.data({ serverTimestamps: "estimate" }));
        return {
          id: entry.id,
          item: {
            ...item,
            bought: item.bought ?? false,
            boughtAt: item.boughtAt ?? null,
            receiptRecorded: item.receiptRecorded ?? false
          }
        };
      }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [kitchenId]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    if (!kitchenId) {
      setLoading(false);
      return undefined;
    }
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onSnapshot(collection(getDatabase(), `${getKitchenDocPath()}/items`), (snapshot) => {
        try {
          setData(snapshot.docs.map((entry) => {
            const item = itemSchema.parse(entry.data({ serverTimestamps: "estimate" }));
            return {
              id: entry.id,
              item: {
                ...item,
                bought: item.bought ?? false,
                boughtAt: item.boughtAt ?? null,
                receiptRecorded: item.receiptRecorded ?? false
              }
            };
          }));
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
      setError(caught instanceof Error ? caught.message : String(caught));
      setLoading(false);
    }
    return () => unsubscribe?.();
  }, [kitchenId]);

  return { data, error, loading, refresh };
}
