import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { formatCents, markBudgetAlertRead } from "@my-kitchen/shared";
import { getDatabase } from "./firebase";
import { useBudgetAlerts } from "./useBudgetData";

export default function NotificationsScreen() {
  const alerts = useBudgetAlerts();
  const [error, setError] = useState<string | null>(null);

  async function toggleRead(id: string, read: boolean) {
    try {
      await markBudgetAlertRead(getDatabase(), id, !read);
      setError(null);
    } catch (caught) {
      setError(`Could not update notification: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>HOUSEHOLD ACTIVITY</Text>
    <Text style={styles.title}>Notifications</Text>
    <Text style={styles.muted}>Budget alerts and read status are shared with household members.</Text>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {alerts.error && <Text accessibilityRole="alert" style={styles.error}>Could not load notifications: {alerts.error}</Text>}
    {alerts.loading && <Text style={styles.muted}>Loading notifications…</Text>}
    {!alerts.loading && !alerts.error && !alerts.data?.length && <Text style={styles.muted}>No notifications yet. Budget alerts will appear here when an active budget reaches a warning threshold.</Text>}
    {[...(alerts.data ?? [])].sort((a, b) => b.alert.createdAt.toMillis() - a.alert.createdAt.toMillis()).map(({ id, alert }) => <View key={id} style={[styles.card, !alert.read && styles.unread]}>
      <Link href="/budgets" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={`View budget alert for ${alert.budgetName}`} style={styles.destination}>
          <Text style={styles.cardTitle}>{alert.budgetName}: {alert.thresholdPercent}% reached</Text>
          <Text style={styles.muted}>{formatCents(alert.spentCents)} of {formatCents(alert.amountCents)} · {alert.periodKey}</Text>
          <Text style={styles.muted}>{alert.createdAt.toDate().toLocaleString()}</Text>
          <Text style={styles.buttonText}>View budgets →</Text>
        </Pressable>
      </Link>
      <Pressable accessibilityRole="button" onPress={() => void toggleRead(id, alert.read)} style={styles.button}>
        <Text style={styles.buttonText}>{alert.read ? "Mark unread" : "Mark read"}</Text>
      </Pressable>
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f5f8f2" },
  content: { padding: 18, gap: 12, paddingBottom: 30 },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#26392e", fontSize: 29, fontWeight: "800" },
  muted: { color: "#748078", fontSize: 13, lineHeight: 19 },
  button: { alignSelf: "flex-start", backgroundColor: "#edf2ed", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12 },
  buttonText: { color: "#226b4a", fontWeight: "700" },
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 7, borderWidth: 1, borderColor: "#e8eee8" },
  unread: { borderColor: "#31835d", backgroundColor: "#f0f8f2" },
  cardTitle: { color: "#26392e", fontSize: 15, fontWeight: "700" },
  destination: { gap: 7 }
});
