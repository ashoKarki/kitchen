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
import { httpsCallable } from "firebase/functions";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ensureSettings } from "@my-kitchen/shared";
import { getCloudFunctions, getDatabase, getFirebaseAuth } from "../src/firebase";
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
  const [membershipStatus, setMembershipStatus] = useState<"checking" | "member" | "private" | "signedOut">("checking");
  const router = useRouter();

  useEffect(() => {
    try {
      return onAuthStateChanged(getFirebaseAuth(), (user) => {
        setAuthUser(user);
        setMembershipStatus(user ? "checking" : "signedOut");
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

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    setMembershipStatus("checking");
    try {
      const bootstrap = httpsCallable<void, { status: "owner" | "member" | "private" }>(
        getCloudFunctions(),
        "bootstrapKitchen"
      );
      void bootstrap().then(({ data }) => {
        if (active) {
          setMembershipStatus(data.status === "owner" || data.status === "member" ? "member" : "private");
          setAuthError(data.status === "private" ? "This app is private. Join with an invitation code." : null);
        }
      }).catch((error: unknown) => {
        if (active) {
          setMembershipStatus("private");
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      });
    } catch (error) {
      setMembershipStatus("private");
      setAuthError(error instanceof Error ? error.message : String(error));
    }
    return () => { active = false; };
  }, [authUser]);

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithCredential(
        getFirebaseAuth(),
        GoogleAuthProvider.credential(idToken)
      );
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const joinKitchen = useCallback(async (code: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const join = httpsCallable<{ code: string }, { status: "member" }>(getCloudFunctions(), "joinHousehold");
      await join({ code });
      setMembershipStatus("member");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(getFirebaseAuth());
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (!authUser || membershipStatus !== "member") return;
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
  }, [authUser, membershipStatus, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PushStatusContext.Provider value={pushStatus}>
        <ToastProvider>
          {!authLoading && !(authUser && membershipStatus === "checking")
            && authUser && membershipStatus === "member"
            ? <Stack screenOptions={{ headerShown: false }} />
            : <GoogleSignInScreen
              authLoading={authLoading}
              authBusy={authBusy}
              error={authError}
              privateAccess={Boolean(authUser)}
              onJoin={joinKitchen}
              onSignOut={() => void signOutUser()}
              onIdToken={signInWithGoogleIdToken}
              onError={setAuthError}
            />}
        </ToastProvider>
      </PushStatusContext.Provider>
    </GestureHandlerRootView>
  );
}
