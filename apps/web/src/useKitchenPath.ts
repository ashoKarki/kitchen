import { useSyncExternalStore } from "react";
import {
  getActiveKitchenId,
  subscribeToActiveKitchenId
} from "@my-kitchen/shared";

export function useKitchenId(): string | null {
  return useSyncExternalStore(
    subscribeToActiveKitchenId,
    getActiveKitchenId,
    getActiveKitchenId
  );
}
