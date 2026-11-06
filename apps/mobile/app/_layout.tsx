import "react-native-gesture-handler";
import { useCallback, useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User
} from "firebase/auth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ensureSettings, KITCHEN_OWNER_EMAIL } from "@my-kitchen/shared";
import { getDatabase, getFirebaseAuth } from "../src/firebase";
import { PushStatusContext } from "../src/pushStatus";
import { ToastProvider } from "../src/toast";
import { registerForPushNotifications } from "../src/push";
import GoogleSignInScreen from "../src/GoogleSignInScreen";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export default function RootLayout() {
  const [pushStatus, setPushStatus] = useState("Setting up push notifications…");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      return onAuthStateChanged(getFirebaseAuth(), (user) => {
        setAuthUser(user);
        setAuthLoading(false);
      }, (error) => {
        setAuthError(error.message);
        setAuthLoading(false);
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      setAuthLoading(false);
      return undefined;
    }
  }, []);

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const credential = await signInWithCredential(
        getFirebaseAuth(),
        GoogleAuthProvider.credential(idToken)
      );
      if (
        credential.user.email?.toLocaleLowerCase() !== KITCHEN_OWNER_EMAIL
        || !credential.user.emailVerified
      ) {
        await signOut(getFirebaseAuth());
        throw new Error(`Use the authorized Google account (${KITCHEN_OWNER_EMAIL}).`);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  useEffect(() => {
    if (
      !authUser
      || authUser.email?.toLocaleLowerCase() !== KITCHEN_OWNER_EMAIL
      || !authUser.emailVerified
    ) return;
    let active = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void (async () => {
      try {
        await ensureSettings(getDatabase(), timeZone);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (active) setPushStatus(`Kitchen setup failed: ${message}`);
        console.error("Kitchen settings initialization failed", error);
        return;
      }
      try {
        const status = await registerForPushNotifications();
        if (active) setPushStatus(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (active) setPushStatus(`Push registration failed: ${message}`);
        console.error("Push registration failed", error);
      }
    })();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.screen === "shopping") {
        router.replace("/(tabs)/shopping");
      } else if (response.notification.request.content.data?.screen === "expenses") {
        router.replace("/(tabs)/expenses");
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [authUser, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PushStatusContext.Provider value={pushStatus}>
        <ToastProvider>
          {!authLoading
            && authUser?.email?.toLocaleLowerCase() === KITCHEN_OWNER_EMAIL
            && authUser.emailVerified
            ? <Stack screenOptions={{ headerShown: false }} />
            : <GoogleSignInScreen
              authLoading={authLoading}
              authBusy={authBusy}
              error={authError ?? (authUser ? `Use the authorized Google account (${KITCHEN_OWNER_EMAIL}).` : null)}
              onIdToken={signInWithGoogleIdToken}
              onError={setAuthError}
            />}
        </ToastProvider>
      </PushStatusContext.Provider>
    </GestureHandlerRootView>
  );
}
