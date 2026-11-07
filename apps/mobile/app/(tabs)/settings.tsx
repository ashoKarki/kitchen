import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { getKitchenDocPath, setActiveKitchenId } from "@my-kitchen/shared";
import RNPickerSelect from "react-native-picker-select";
import {
  expenseCategories,
  updateSettings,
  type ExpenseCategory
} from "@my-kitchen/shared";
import { getCloudFunctions, getDatabase, getFirebaseAuth } from "../../src/firebase";
import { useKitchenId } from "../../src/useKitchenPath";
import { registerForPushNotifications } from "../../src/push";
import { usePushStatus } from "../../src/pushStatus";
import { useToast } from "../../src/toast";
import { useSettings } from "../../src/useSettings";

export default function SettingsScreen() {
  const { showToast } = useToast();
  const { data, error, loading } = useSettings();
  const pushStatus = usePushStatus();
  const [localPushStatus, setLocalPushStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function save(changes: Parameters<typeof updateSettings>[1]) {
    setSaving(true);
    setSaveError(null);
    try {
      await updateSettings(getDatabase(), changes, getFirebaseAuth().currentUser?.uid);
      showToast("Settings saved.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setSaveError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function retryPushSetup() {
    setLocalPushStatus(null);
    try {
      const status = await registerForPushNotifications();
      setLocalPushStatus(status);
      showToast(status.startsWith("Push registration failed") ? status : "Push setup checked.", status.startsWith("Push registration failed") ? "error" : "info");
    } catch (caught) {
      const message = `Push registration failed: ${caught instanceof Error ? caught.message : String(caught)}`;
      setLocalPushStatus(message);
      showToast(message, "error");
    }
  }

  async function leaveKitchen() {
    setSigningOut(true);
    setSaveError(null);
    try {
      await signOut(getFirebaseAuth());
      showToast("Signed out.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setSaveError(message);
      showToast(message, "error");
      setSigningOut(false);
    }
  }

  if (loading) return <View style={styles.center}><Text style={styles.muted}>Loading settings…</Text></View>;
  if (error || !data) return <View style={styles.page}><Text accessibilityRole="alert" style={styles.error}>Could not load settings: {error ?? "Settings unavailable."}</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>MAKE IT YOURS</Text>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Manage reminders and how your spending is categorized.</Text>
      <HouseholdSettings />
      <AccountSettings />
      {saveError && <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text>}
      {saving && <Text accessibilityLiveRegion="polite" style={styles.hint}>Saving…</Text>}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Finished item reminder</Text>
        <Text style={styles.muted}>A daily reminder when something is marked finished.</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>Enable daily reminder</Text>
          <Switch
            accessibilityLabel="Enable daily reminder"
            onValueChange={(reminderEnabled) => void save({ reminderEnabled })}
            trackColor={{ true: "#8bc29d" }}
            value={data.reminderEnabled}
          />
        </View>
        <View style={styles.hourRow}>
          <Text style={styles.rowText}>Reminder hour</Text>
          <View style={styles.picker}>
            <RNPickerSelect
              onValueChange={(value: number | null) => {
                if (typeof value === "number" && value >= 0 && value <= 23) void save({ reminderHour: value });
              }}
              items={Array.from({ length: 24 }, (_, hour) => ({
                label: `${String(hour).padStart(2, "0")}:00`,
                value: hour
              }))}
              value={data.reminderHour}
              useNativeAndroidPickerStyle
            />
          </View>
        </View>
        <Text style={styles.hint}>Timezone: {data.timeZone}</Text>
        <View style={styles.pushBox}>
          <Text style={styles.sectionSubtitle}>This device</Text>
          <Text accessibilityRole="text" style={styles.muted}>{localPushStatus ?? pushStatus}</Text>
          <Pressable accessibilityRole="button" onPress={() => void retryPushSetup()} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Check push setup</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Budget alerts</Text>
        <Text style={styles.muted}>Receive an in-app and push alert as an active budget reaches its warning thresholds and goes over budget.</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>Enable budget alerts</Text>
          <Switch
            accessibilityLabel="Enable budget alerts"
            onValueChange={(budgetAlertsEnabled) => void save({ budgetAlertsEnabled })}
            trackColor={{ true: "#8bc29d" }}
            value={data.budgetAlertsEnabled}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Discretionary categories</Text>
        <Text style={styles.muted}>These categories count toward discretionary spending.</Text>
        {expenseCategories.map((category) => (
          <View style={styles.row} key={category}>
            <Text style={styles.rowText}>{category}</Text>
            <Switch
              accessibilityLabel={`${category} is discretionary`}
              onValueChange={(checked) => {
                const discretionaryCategories: ExpenseCategory[] = checked
                  ? [...data.discretionaryCategories, category]
                  : data.discretionaryCategories.filter((entry) => entry !== category);
                void save({ discretionaryCategories });
              }}
              trackColor={{ true: "#8bc29d" }}
              value={data.discretionaryCategories.includes(category)}
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>My Kitchen</Text>
        <Text style={styles.muted}>Personal kitchen and spending tracker · English interface · EUR</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Google account</Text>
        <Text style={styles.muted}>{getFirebaseAuth().currentUser?.email ?? "Signed in"}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={signingOut}
          onPress={() => void leaveKitchen()}
          style={[styles.smallButton, signingOut && styles.disabledButton]}
        >
          <Text style={styles.smallButtonText}>{signingOut ? "Signing out…" : "Sign out"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface HouseholdMemberInfo {
  uid: string;
  role: "owner" | "member";
  displayName: string;
}

function HouseholdSettings() {
  const { showToast } = useToast();
  const kitchenId = useKitchenId();
  const [members, setMembers] = useState<HouseholdMemberInfo[] | null>(null);
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadMembers() {
    try {
      const snapshot = await getDoc(doc(getDatabase(), getKitchenDocPath()));
      if (!snapshot.exists()) throw new Error("The active household could not be found.");
      const rawMembers: unknown = snapshot.get("members");
      const rawProfiles: unknown = snapshot.get("memberProfiles");
      if (typeof rawMembers !== "object" || rawMembers === null || Array.isArray(rawMembers)) {
        throw new Error("The active household has invalid membership data.");
      }
      const members = Object.entries(rawMembers).flatMap(([uid, role]) => {
        if (role !== "owner" && role !== "member") return [];
        const profile = typeof rawProfiles === "object" && rawProfiles !== null
          ? Reflect.get(rawProfiles, uid)
          : null;
        const displayName = typeof profile === "object" && profile !== null
          ? Reflect.get(profile, "displayName")
          : null;
        return [{ uid, role, displayName: typeof displayName === "string" ? displayName : "" }];
      });
      setMembers(members);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [kitchenId]);

  async function createInvite() {
    setBusy(true);
    setError(null);
    setInviteCode(null);
    try {
      const create = httpsCallable<{ email?: string }, { code: string }>(
        getCloudFunctions(),
        "createInvite"
      );
      const response = await create(email.trim() ? { email: email.trim() } : {});
      setInviteCode(response.data.code);
      setEmail("");
      showToast("Invitation code created; it expires in 48 hours.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function joinHousehold() {
    setBusy(true);
    setError(null);
    try {
      const join = httpsCallable<{ code: string }, { status: "member"; householdId: string }>(
        getCloudFunctions(),
        "joinHousehold"
      );
      const response = await join({ code: joinCode.trim() });
      setActiveKitchenId(response.data.householdId);
      setJoinCode("");
      setMembers(null);
      showToast("Joined the household. Your previous personal household is retained.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function manageMember(uid: string, operation: "removeHouseholdMember" | "transferOwnership") {
    setBusy(true);
    setError(null);
    try {
      const invoke = httpsCallable<{ uid: string }, { status: string }>(getCloudFunctions(), operation);
      await invoke({ uid });
      await loadMembers();
      showToast(operation === "removeHouseholdMember" ? "Member removed." : "Ownership transferred.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (members === null && !error) {
    return <View style={styles.card}><Text style={styles.muted}>Loading household settings…</Text></View>;
  }
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Join a household</Text>
      <Text style={styles.muted}>Enter an invitation code to switch from your personal household. Your personal data is retained.</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <TextInput
        accessibilityLabel="Invitation code"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setJoinCode}
        placeholder="Invitation code"
        style={styles.inviteInput}
        value={joinCode}
      />
      <Pressable accessibilityRole="button" disabled={busy || !joinCode.trim()} onPress={() => void joinHousehold()} style={styles.smallButton}>
        <Text style={styles.smallButtonText}>{busy ? "Working…" : "Join household"}</Text>
      </Pressable>
      {members && members.some((member) => member.role === "owner") && (
        <>
          <Text style={styles.sectionTitle}>Your household</Text>
          <Text style={styles.muted}>Create a single-use invitation code that expires after 48 hours.</Text>
          <TextInput
            accessibilityLabel="Email lock for invitation"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email lock (optional)"
            style={styles.inviteInput}
            value={email}
          />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void createInvite()} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>{busy ? "Working…" : "Create invitation"}</Text>
          </Pressable>
          {inviteCode && <Text selectable style={styles.success}>Share this code with your partner; it is shown once: {inviteCode}</Text>}
        </>
      )}
      {members?.filter((member) => member.role !== "owner").map((member) => (
        <View key={member.uid} style={styles.memberRow}>
          <Text style={styles.rowText}>{member.displayName || "Kitchen member"}</Text>
          <View style={styles.memberActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert(
              "Transfer ownership?",
              `Transfer ownership to ${member.displayName || "this member"}?`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Transfer", onPress: () => void manageMember(member.uid, "transferOwnership") }
              ]
            )}>
              <Text style={styles.memberAction}>Transfer</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert(
              "Remove member?",
              `Remove ${member.displayName || "this member"} from the household?`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => void manageMember(member.uid, "removeHouseholdMember") }
              ]
            )}>
              <Text style={styles.memberAction}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function AccountSettings() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openLegalPage(path: string) {
    try {
      await Linking.openURL(`https://shoppingcart.at${path}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const remove = httpsCallable<void, { status: "deleted" }>(getCloudFunctions(), "deleteMyAccount");
      await remove();
      await signOut(getFirebaseAuth());
      showToast("Account deleted.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Account</Text>
      <Text style={styles.muted}>Delete your account, household membership, personal settings and registered devices. Shared household records remain for other members.</Text>
      <Text style={styles.hint}>Owners must transfer ownership before deleting their account. This does not delete the household.</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert(
        "Delete your account?",
        "You will lose access to this household. Shared household records will remain for other members.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete account", style: "destructive", onPress: () => void deleteAccount() }
        ]
      )} style={[styles.smallButton, busy && styles.disabledButton]}>
        <Text style={styles.smallButtonText}>{busy ? "Deleting…" : "Delete my account"}</Text>
      </Pressable>
      <View style={styles.legalLinks}>
        <Pressable onPress={() => void openLegalPage("/privacy")}>
          <Text style={styles.memberAction}>Privacy policy</Text>
        </Pressable>
        <Pressable onPress={() => void openLegalPage("/terms")}>
          <Text style={styles.memberAction}>Terms of use</Text>
        </Pressable>
        <Pressable onPress={() => void openLegalPage("/account-deletion")}>
          <Text style={styles.memberAction}>Account deletion help</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f5f8f2" },
  content: { padding: 18, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f8f2" },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#26392e", fontSize: 29, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "#748078", fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  card: { backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 15, padding: 18, marginBottom: 13 },
  sectionTitle: { color: "#26392e", fontSize: 17, fontWeight: "700" },
  sectionSubtitle: { color: "#374a3d", fontSize: 13, fontWeight: "700" },
  muted: { color: "#748078", fontSize: 12, lineHeight: 18, marginTop: 6 },
  row: { minHeight: 48, borderTopColor: "#eff2ef", borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 9, paddingTop: 7 },
  rowText: { color: "#394b3e", fontSize: 13, flex: 1, marginRight: 10 },
  hourRow: { minHeight: 45, borderTopColor: "#eff2ef", borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  picker: { width: 130 },
  hint: { color: "#89928b", fontSize: 11, marginTop: 8 },
  pushBox: { borderTopColor: "#eff2ef", borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  smallButton: { backgroundColor: "#edf2ed", borderRadius: 8, alignSelf: "flex-start", marginTop: 10, paddingVertical: 8, paddingHorizontal: 10 },
  disabledButton: { opacity: 0.55 },
  smallButtonText: { color: "#47584c", fontSize: 12, fontWeight: "600" },
  inviteInput: { borderWidth: 1, borderColor: "#dce4dc", borderRadius: 8, color: "#394b3e", paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  success: { color: "#286b4f", backgroundColor: "#edf7ef", borderRadius: 8, padding: 10, marginTop: 12, fontSize: 12 },
  memberRow: { minHeight: 48, borderTopColor: "#eff2ef", borderTopWidth: 1, flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 8 },
  memberActions: { flexDirection: "row", gap: 14 },
  memberAction: { color: "#286b4f", fontSize: 12, fontWeight: "700" },
  legalLinks: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 16, paddingTop: 12, borderTopColor: "#eff2ef", borderTopWidth: 1 },
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8, marginBottom: 10 }
});
