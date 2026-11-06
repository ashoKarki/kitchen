import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDatabase, getFirebaseAuth } from "./firebase";

const PUSH_NOTIFICATIONS_ENABLED = false;

export async function registerForPushNotifications(): Promise<string> {
  if (!PUSH_NOTIFICATIONS_ENABLED) {
    return "Push notifications are temporarily disabled for Apple Personal Team signing.";
  }

  if (!Device.isDevice) {
    return "Push notifications require a physical device.";
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Kitchen reminders",
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return "Notifications are disabled. Enable them in system settings to receive reminders.";

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || projectId.length === 0) {
    return "Push is not configured yet. Run `eas init` to set the Expo project ID.";
  }

  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error("Sign in before registering this device for notifications.");
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return "Push registration is available on iOS and Android only.";
  }
  await setDoc(doc(getDatabase(), "kitchen/main/devices", pushToken), {
    platform: Platform.OS,
    uid,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return "This device is registered for kitchen reminders.";
}
