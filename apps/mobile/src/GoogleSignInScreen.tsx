import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import { Platform } from "react-native";

interface GoogleSignInScreenProps {
  authLoading: boolean;
  authBusy: boolean;
  error: string | null;
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
}

WebBrowser.maybeCompleteAuthSession();

export default function GoogleSignInScreen({
  authLoading,
  authBusy,
  error,
  onIdToken,
  onError
}: GoogleSignInScreenProps) {
  if (Constants.appOwnership === "expo") {
    return <SignInCard
      authLoading={authLoading}
      authBusy={authBusy}
      error={error}
      setupMessage="Google sign-in redirects do not work in Expo Go. Install and open the My Kitchen development build, then start Expo with `npx expo start --dev-client`."
    />;
  }

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const platformClientId = Platform.OS === "ios" ? iosClientId : androidClientId;

  if (!webClientId || !platformClientId) {
    const missingIds = [
      !webClientId && "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
      !platformClientId && (Platform.OS === "ios"
        ? "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"
        : "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID")
    ].filter(Boolean).join(" and ");
    return <SignInCard
      authLoading={authLoading}
      authBusy={authBusy}
      error={error}
      setupMessage={`Google sign-in is not configured for ${Platform.OS}. Add ${missingIds} to apps/mobile/.env, then restart Expo.`}
    />;
  }

  return <ConfiguredGoogleSignIn
    authLoading={authLoading}
    authBusy={authBusy}
    error={error}
    webClientId={webClientId}
    iosClientId={iosClientId}
    androidClientId={androidClientId}
    onIdToken={onIdToken}
    onError={onError}
  />;
}

function ConfiguredGoogleSignIn({
  authLoading,
  authBusy,
  error,
  webClientId,
  iosClientId,
  androidClientId,
  onIdToken,
  onError
}: GoogleSignInScreenProps & {
  webClientId: string;
  iosClientId: string | undefined;
  androidClientId: string | undefined;
}) {
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
    ...(androidClientId ? { androidClientId } : {}),
    selectAccount: true
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      if (!idToken) {
        onError("Google sign-in did not return an ID token. Check the OAuth client configuration.");
        return;
      }
      onIdToken(idToken);
    } else if (response?.type === "error") {
      onError(response.error?.message ?? "Google sign-in failed.");
    }
  }, [onError, onIdToken, response]);

  return <SignInCard
    authLoading={authLoading}
    authBusy={authBusy}
    error={error}
    setupMessage={!request && !authLoading
      ? "Preparing Google sign-in. Please wait a moment."
      : null}
    requestReady={Boolean(request)}
    onSignIn={() => {
      void promptAsync().catch((caught: unknown) => {
        onError(caught instanceof Error ? caught.message : String(caught));
      });
    }}
  />;
}

function SignInCard({
  authLoading,
  authBusy,
  error,
  setupMessage,
  requestReady = false,
  onSignIn
}: {
  authLoading: boolean;
  authBusy: boolean;
  error: string | null;
  setupMessage: string | null;
  requestReady?: boolean;
  onSignIn?: () => void;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.mark}>m</Text>
        <Text style={styles.eyebrow}>YOUR PRIVATE KITCHEN</Text>
        <Text style={styles.title}>Sign in to My Kitchen</Text>
        <Text style={styles.description}>
          Use the authorized Google account to access your pantry and spending data.
        </Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {setupMessage && (
          <Text accessibilityRole="alert" style={styles.error}>
            {setupMessage}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={authLoading || authBusy || !requestReady || !onSignIn}
          onPress={onSignIn}
          style={({ pressed }) => [
            styles.button,
            (authLoading || authBusy || !requestReady || !onSignIn) && styles.buttonDisabled,
            pressed && styles.buttonPressed
          ]}
        >
          <Text style={styles.buttonText}>
            {authLoading ? "Checking sign-in…" : authBusy ? "Signing in…" : "Continue with Google"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f8f2", padding: 22 },
  card: { width: "100%", maxWidth: 440, alignItems: "flex-start", backgroundColor: "#fff", borderColor: "#e6ece4", borderWidth: 1, borderRadius: 18, padding: 26 },
  mark: { width: 40, height: 40, overflow: "hidden", borderRadius: 12, backgroundColor: "#dff0e3", color: "#31835d", textAlign: "center", textAlignVertical: "center", fontSize: 28, fontWeight: "800" },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 20 },
  title: { color: "#26392e", fontSize: 26, fontWeight: "800", marginTop: 8 },
  description: { color: "#748078", fontSize: 14, lineHeight: 21, marginTop: 10 },
  error: { width: "100%", color: "#a53b32", backgroundColor: "#fff0ee", borderRadius: 9, padding: 10, fontSize: 13, marginTop: 14 },
  button: { width: "100%", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 10, backgroundColor: "#31835d", marginTop: 22, paddingHorizontal: 16 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { backgroundColor: "#226b4a" },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" }
});
