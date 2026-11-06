import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { signOut } from "firebase/auth";
import RNPickerSelect from "react-native-picker-select";
import {
  expenseCategories,
  updateSettings,
  type ExpenseCategory
} from "@my-kitchen/shared";
import { getDatabase, getFirebaseAuth } from "../../src/firebase";
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
      await updateSettings(getDatabase(), changes);
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
        <Text style={styles.muted}>Receive an in-app and push alert when an active budget reaches 80% or 100%.</Text>
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
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8, marginBottom: 10 }
});
