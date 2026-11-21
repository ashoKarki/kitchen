import { useEffect } from "react";
import { AppState } from "react-native";
import { syncExpiryNotifications } from "./expiryNotifications";
import { useItems } from "./useItems";
import { useToast } from "./toast";

export default function ExpiryReminderManager({ userId, kitchenId }: { userId: string; kitchenId: string }) {
  const items = useItems();
  const { showToast } = useToast();

  useEffect(() => {
    if (!items.data) return undefined;
    let active = true;
    let reported: string | null = null;
    const sync = () => {
      if (!items.data) return;
      void syncExpiryNotifications(userId, kitchenId, items.data, () => active).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (active && message !== reported) {
          reported = message;
          showToast(`Expiry reminders: ${message}`, "error");
        }
      });
    };
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [items.data, userId, kitchenId, showToast]);

  return null;
}
