import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  Timestamp,
  type Firestore
} from "firebase/firestore";
import { ensureSettings, KITCHEN_DOC_PATH, expenseCategories } from "@my-kitchen/shared";
import type { KitchenItem, KitchenSettings, Receipt } from "@my-kitchen/shared";
import { z } from "zod";
import { getDatabase } from "./firebase";

const itemSchema = z.object({
  name: z.string().min(1).max(100),
  quantity: z.number().int().min(0).max(9999),
  category: z.enum(expenseCategories),
  state: z.enum(["inStock", "finished", "toBuy"]),
  bought: z.boolean().optional(),
  boughtAt: z.instanceof(Timestamp).nullable().optional(),
  receiptRecorded: z.boolean().optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp)
});

const settingsSchema = z.object({
  reminderEnabled: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
  timeZone: z.string(),
  budgetAlertsEnabled: z.boolean(),
  discretionaryCategories: z.array(z.enum(expenseCategories))
});

const lineItemSchema = z.object({
  rawName: z.string(),
  name: z.string(),
  quantity: z.number().int(),
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

export interface LiveData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function database(): Firestore {
  return getDatabase();
}

export function useItems(): LiveData<Array<{ id: string; item: KitchenItem }>> {
  const [state, setState] = useState<LiveData<Array<{ id: string; item: KitchenItem }>>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onSnapshot(
        collection(database(), `${KITCHEN_DOC_PATH}/items`),
        (snapshot) => {
          try {
            const data = snapshot.docs.map((entry) => {
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
            });
            setState({ data, loading: false, error: null });
          } catch (error) {
            setState({
              data: null,
              loading: false,
              error: `Invalid item data: ${error instanceof Error ? error.message : String(error)}`
            });
          }
        },
        (error) => setState({ data: null, loading: false, error: error.message })
      );
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return () => unsubscribe?.();
  }, []);
  return state;
}

export function useSettings(): LiveData<KitchenSettings> {
  const [state, setState] = useState<LiveData<KitchenSettings>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    async function subscribe() {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const db = database();
        await ensureSettings(db, timeZone);
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, KITCHEN_DOC_PATH),
          (snapshot) => {
            try {
              setState({
                data: settingsSchema.parse(snapshot.data()),
                loading: false,
                error: null
              });
            } catch (error) {
              setState({
                data: null,
                loading: false,
                error: `Invalid settings: ${error instanceof Error ? error.message : String(error)}`
              });
            }

          },
          (error) => setState({ data: null, loading: false, error: error.message })
        );
      } catch (error) {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    void subscribe();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return state;
}

export function useReceipts(): LiveData<Array<{ id: string; receipt: Receipt }>> {
  const [state, setState] = useState<LiveData<Array<{ id: string; receipt: Receipt }>>>({
    data: null,
    loading: true,
    error: null
  });
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onSnapshot(
        collection(database(), `${KITCHEN_DOC_PATH}/receipts`),
        (snapshot) => {
          try {
            const data = snapshot.docs.map((entry) => ({
              id: entry.id,
              receipt: receiptSchema.parse(entry.data({ serverTimestamps: "estimate" }))
            }));
            setState({ data, loading: false, error: null });
          } catch (error) {
            setState({
              data: null,
              loading: false,
              error: `Invalid receipt data: ${error instanceof Error ? error.message : String(error)}`
            });
          }
        },
        (error) => setState({ data: null, loading: false, error: error.message })
      );
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return () => unsubscribe?.();
  }, []);
  return state;
}
