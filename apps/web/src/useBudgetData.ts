import { useEffect, useState } from "react";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import {
  expenseCategories,
  getKitchenDocPath,
  type Budget,
  type BudgetAlert
} from "@my-kitchen/shared";
import { z } from "zod";
import { getDatabase } from "./firebase";
import { useKitchenId } from "./useKitchenPath";

const budgetScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("overall") }),
  z.object({ type: z.literal("discretionary") }),
  z.object({ type: z.literal("categories"), categories: z.array(z.enum(expenseCategories)).min(1).max(10) })
]);
const budgetSchema = z.object({
  name: z.string().min(1).max(100),
  period: z.enum(["weekly", "monthly"]),
  amountCents: z.number().int().positive(),
  scope: budgetScopeSchema,
  active: z.boolean(),
  alertState: z.object({
    periodKey: z.string(),
    sentThresholds: z.array(z.number().int().min(70))
  }).optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp)
});
const alertSchema = z.object({
  budgetId: z.string(),
  budgetName: z.string(),
  period: z.enum(["weekly", "monthly"]),
  periodKey: z.string(),
  thresholdPercent: z.number().int().min(70),
  amountCents: z.number().int().positive(),
  spentCents: z.number().int(),
  read: z.boolean(),
  createdAt: z.instanceof(Timestamp)
});

export function useBudgets() {
  const kitchenId = useKitchenId();
  const [data, setData] = useState<Array<{ id: string; budget: Budget }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(null);
    setLoading(true);
    if (!kitchenId) {
      setLoading(false);
      return undefined;
    }
    try {
      return onSnapshot(collection(getDatabase(), `${getKitchenDocPath()}/budgets`), (snapshot) => {
        try {
          setData(snapshot.docs.map((entry) => ({
            id: entry.id,
            budget: budgetSchema.parse(entry.data({ serverTimestamps: "estimate" }))
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
      return undefined;
    }
  }, [kitchenId]);

  return { data, error, loading };
}

export function useBudgetAlerts() {
  const kitchenId = useKitchenId();
  const [data, setData] = useState<Array<{ id: string; alert: BudgetAlert }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(null);
    setLoading(true);
    if (!kitchenId) {
      setLoading(false);
      return undefined;
    }
    try {
      return onSnapshot(collection(getDatabase(), `${getKitchenDocPath()}/alerts`), (snapshot) => {
        try {
          setData(snapshot.docs.map((entry) => ({
            id: entry.id,
            alert: alertSchema.parse(entry.data({ serverTimestamps: "estimate" }))
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
      return undefined;
    }
  }, [kitchenId]);

  return { data, error, loading };
}
