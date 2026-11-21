import { useEffect } from "react";
import { AppState, NativeEventEmitter, NativeModules, Platform } from "react-native";
import { getDatabase } from "./firebase";
import { saveVoiceShoppingItem } from "./saveVoiceShoppingItem";
import { useToast } from "./toast";
import { isVoiceShoppingModule, VoiceShoppingQueue } from "./voiceShoppingQueue";

export default function VoiceShopping({ userId, kitchenId }: { userId: string; kitchenId: string }) {
  const { showToast } = useToast();
  const module: unknown = Platform.OS === "ios" ? NativeModules.VoiceShoppingModule : undefined;

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    if (!isVoiceShoppingModule(module)) {
      showToast("Siri shopping is unavailable in this build. Rebuild and reinstall the iOS app.", "error");
      return undefined;
    }
    const controller = new VoiceShoppingQueue(
      module, userId, kitchenId, (item) => saveVoiceShoppingItem(getDatabase(), kitchenId, item),
      (item) => showToast(`${item.name} added to Shopping List.`),
      (message) => showToast(message, "error")
    );
    const subscription = new NativeEventEmitter(module).addListener("voiceShoppingChanged", () => void controller.load());
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void controller.load();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void controller.load();
    }, 3000);
    void controller.load();
    return () => {
      controller.dispose();
      clearInterval(timer);
      subscription.remove();
      appState.remove();
    };
  }, [module, userId, kitchenId, showToast]);

  return null;
}
