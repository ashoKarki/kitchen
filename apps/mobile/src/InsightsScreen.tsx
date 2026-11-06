import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { httpsCallable } from "firebase/functions";
import {
  buildSpendingInsightReport,
  formatCents,
  type AiInsightContext
} from "@my-kitchen/shared";
import { getCloudFunctions } from "./firebase";
import { useReceipts } from "./useReceipts";
import { useSettings } from "./useSettings";
import { useBudgets } from "./useBudgetData";
import { useToast } from "./toast";

interface GenerateInsightsRequest {
  context: AiInsightContext;
}

interface GeneratedInsights {
  summary: string;
  observations: string[];
  suggestions: string[];
}

export default function InsightsScreen() {
  const { showToast } = useToast();
  const receipts = useReceipts();
  const budgets = useBudgets();
  const settings = useSettings();
  const [aiInsights, setAiInsights] = useState<GeneratedInsights | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timeZone = settings.data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const report = useMemo(() => buildSpendingInsightReport(
    receipts.data ?? [],
    new Date(),
    timeZone,
    settings.data?.discretionaryCategories ?? [],
    budgets.data ?? []
  ), [budgets.data, receipts.data, settings.data?.discretionaryCategories, timeZone]);
  const loading = receipts.loading || budgets.loading || settings.loading;
  const loadError = receipts.error ?? budgets.error ?? settings.error;
  async function generateAiInsights() {
    setAiBusy(true);
    setError(null);
    setNotice(null);
    try {
      const generate = httpsCallable<GenerateInsightsRequest, GeneratedInsights>(
        getCloudFunctions(),
        "generateInsights"
      );
      const response = await generate({ context: report.aiContext });
      setAiInsights(response.data);
      setNotice("AI insight generated from aggregate totals and categories only.");
      showToast("AI insight generated.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) return <View style={styles.center}><Text style={styles.muted}>Loading insights…</Text></View>;
  if (loadError) return <View style={styles.page}><Text accessibilityRole="alert" style={styles.error}>Could not load insights: {loadError}</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>UNDERSTAND YOUR SPENDING</Text>
      <Text style={styles.title}>Insights</Text>
      <Text style={styles.subtitle}>A clear, non-judgmental view of your recorded spending.</Text>
      {notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.card}>
        <View style={styles.periodRow}>
          <View style={styles.periodCard}><Text style={styles.periodLabel}>{report.report.aggregate.currentPeriod.label}</Text><Text style={styles.total}>{formatCents(report.report.aggregate.currentPeriod.totalCents)}</Text><Text style={styles.muted}>{report.report.aggregate.currentPeriod.receiptCount} receipts</Text></View>
          <View style={styles.periodCard}><Text style={styles.periodLabel}>{report.report.aggregate.previousPeriod.label}</Text><Text style={styles.total}>{formatCents(report.report.aggregate.previousPeriod.totalCents)}</Text><Text style={styles.muted}>{report.report.aggregate.previousPeriod.receiptCount} receipts</Text></View>
        </View>
        <Text style={styles.sectionTitle}>Spending patterns</Text>
        {report.report.messages.length === 0 ? <Text style={styles.muted}>Add receipts to build a spending history and see observations.</Text> : report.report.messages.map((message) => (
          <View key={message.id} style={[styles.message, message.kind === "warning" ? styles.warningMessage : message.kind === "positive" ? styles.positiveMessage : null]}>
            <Text style={styles.messageTitle}>{message.title}</Text>
            <Text style={styles.messageDetail}>{message.detail}</Text>
          </View>
        ))}
        {report.report.aggregate.categoryTotals.length > 0 && <>
          <Text style={styles.sectionTitle}>Category totals this month</Text>
          {report.report.aggregate.categoryTotals.map(({ category, amountCents }) => (
            <View style={styles.categoryRow} key={category}><Text style={styles.categoryName}>{category}</Text><Text style={styles.categoryAmount}>{formatCents(amountCents)}</Text></View>
          ))}
        </>}
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>OPTIONAL AI SUMMARY</Text>
        <Text style={styles.sectionTitle}>Ask for a narrative</Text>
        <Text style={styles.muted}>Only aggregate period totals, categories, and budget progress are sent. Receipt images, item names, and store names are not sent.</Text>
        <Pressable accessibilityRole="button" disabled={aiBusy} onPress={() => void generateAiInsights()} style={[styles.aiButton, aiBusy && styles.disabledButton]}>
          <Text style={styles.aiButtonText}>{aiBusy ? "Generating…" : "Generate AI insights"}</Text>
        </Pressable>
        {aiInsights && <View style={styles.aiResult}>
          <Text style={styles.messageDetail}>{aiInsights.summary}</Text>
          {aiInsights.observations.map((entry, index) => <Text style={styles.bullet} key={`observation-${index}`}>• {entry}</Text>)}
          {aiInsights.suggestions.map((entry, index) => <Text style={styles.bullet} key={`suggestion-${index}`}>• {entry}</Text>)}
        </View>}
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
  subtitle: { color: "#748078", fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 14 },
  card: { backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 12 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  periodCard: { flex: 1, backgroundColor: "#f7faf6", borderRadius: 9, padding: 10 },
  periodLabel: { color: "#748078", fontSize: 10 },
  total: { color: "#26392e", fontSize: 17, fontWeight: "800", marginTop: 6 },
  muted: { color: "#748078", fontSize: 11, lineHeight: 17, marginTop: 5 },
  sectionTitle: { color: "#26392e", fontSize: 15, fontWeight: "700", marginTop: 13, marginBottom: 8 },
  message: { backgroundColor: "#f7faf6", borderRadius: 9, padding: 11, marginBottom: 8 },
  warningMessage: { backgroundColor: "#fff5e3" },
  positiveMessage: { backgroundColor: "#eef8ef" },
  messageTitle: { color: "#2e4035", fontSize: 12, fontWeight: "700" },
  messageDetail: { color: "#59675e", fontSize: 11, lineHeight: 17, marginTop: 4 },
  categoryRow: { minHeight: 35, borderTopColor: "#eff2ef", borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryName: { color: "#59675e", fontSize: 11 },
  categoryAmount: { color: "#394b3e", fontSize: 11, fontWeight: "600" },
  aiButton: { backgroundColor: "#31835d", borderRadius: 9, padding: 12, alignItems: "center", marginTop: 14 },
  aiButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  disabledButton: { opacity: 0.45 },
  hint: { color: "#89928b", fontSize: 10, lineHeight: 15, marginTop: 9 },
  aiResult: { borderTopColor: "#eff2ef", borderTopWidth: 1, marginTop: 14, paddingTop: 10 },
  bullet: { color: "#59675e", fontSize: 11, lineHeight: 17, marginTop: 6 },
  success: { color: "#24693f", backgroundColor: "#e7f5e9", padding: 10, borderRadius: 8, marginBottom: 10 },
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8, marginBottom: 10 }
});
