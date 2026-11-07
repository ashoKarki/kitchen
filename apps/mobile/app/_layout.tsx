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
import {
  bootstrapPersonalHousehold,
  ensureSettings,
  householdBootstrapErrorMessage,
  setActiveKitchenId
} from "@my-kitchen/shared";
import { useKitchenId } from "../src/useKitchenPath";
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
  const activeKitchenId = useKitchenId();
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
        setActiveKitchenId(null);
        setAuthLoading(false);
      }, (error) => {
        setAuthError(error.message);
        setAuthLoading(false);
      });
    } catch (error) {
      setAuthError(householdBootstrapErrorMessage(error));
      setAuthLoading(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    setMembershipStatus("checking");
    try {
      void (async () => {
        if (!authUser.emailVerified) {
          throw new Error("Verify your Google account email before creating a household.");
        }
        await authUser.getIdToken(true);
        const result = await bootstrapPersonalHousehold(getDatabase(), authUser.uid, {
          displayName: authUser.displayName ?? "",
          photoURL: authUser.photoURL ?? ""
        });
        return result.householdId;
      })().then((householdId) => {
        if (active) {
          setActiveKitchenId(householdId);
          setMembershipStatus("member");
          setAuthError(null);
        }
      }).catch((error: unknown) => {
        if (active) {
          setMembershipStatus("private");
          setAuthError(householdBootstrapErrorMessage(error));
        }
      });
    } catch (error) {
      setMembershipStatus("private");
      setAuthError(householdBootstrapErrorMessage(error));
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
      const join = httpsCallable<{ code: string }, { status: "member"; householdId: string }>(getCloudFunctions(), "joinHousehold");
      const { data } = await join({ code });
      setActiveKitchenId(data.householdId);
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
    if (!authUser || membershipStatus !== "member" || !activeKitchenId) return;
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
  }, [authUser, membershipStatus, router, activeKitchenId]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PushStatusContext.Provider value={pushStatus}>
        <ToastProvider>
          {!authLoading && !(authUser && membershipStatus === "checking")
            && authUser && membershipStatus === "member"
            ? <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications", headerTintColor: "#26392e", headerStyle: { backgroundColor: "#ffffff" } }} />
            </Stack>
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
