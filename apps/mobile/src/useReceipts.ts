import { useCallback, useEffect, useState } from "react";
import { collection, getDocsFromServer, onSnapshot, Timestamp } from "firebase/firestore";
import { expenseCategories, getKitchenDocPath } from "@my-kitchen/shared";
import type { Receipt } from "@my-kitchen/shared";
import { z } from "zod";
import { getDatabase } from "./firebase";
import { useKitchenId } from "./useKitchenPath";

const lineItemSchema = z.object({
  rawName: z.string(),
  name: z.string(),
  quantity: z.number(),
  amountCents: z.number().int(),
  category: z.enum(expenseCategories),
  necessity: z.enum(["essential", "discretionary", "neutral"]),
  isDeposit: z.boolean().optional()
});

const receiptSchema = z.object({
  source: z.enum(["scan", "manual"]),
  storeName: z.string(),
  purchaseDateKey: z.string(),
  purchaseTime: z.string().optional(),
  totalCents: z.number().int(),
  currency: z.literal("EUR"),
  paymentMethod: z.enum(["cash", "card", "other"]).optional(),
  lineItems: z.array(lineItemSchema).max(200),
  dedupeHash: z.string(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp)
});

export function useReceipts() {
  const kitchenId = useKitchenId();
  const [data, setData] = useState<Array<{ id: string; receipt: Receipt }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDocsFromServer(collection(getDatabase(), `${getKitchenDocPath()}/receipts`));
      setData(snapshot.docs.map((entry) => ({
        id: entry.id,
        receipt: receiptSchema.parse(entry.data({ serverTimestamps: "estimate" }))
      })));
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
      unsubscribe = onSnapshot(collection(getDatabase(), `${getKitchenDocPath()}/receipts`), (snapshot) => {
        try {
          setData(snapshot.docs.map((entry) => ({
            id: entry.id,
            receipt: receiptSchema.parse(entry.data({ serverTimestamps: "estimate" }))
          })));
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
