import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import RNPickerSelect from "react-native-picker-select";
import { pickerSelectStyle } from "./pickerStyles";
import { useToast } from "./toast";
import {
  budgetScopeLabel,
  createBudget,
  deleteBudget,
  expenseCategories,
  filterReceiptsByPeriod,
  formatCents,
  getBudgetSpendCents,
  markBudgetAlertRead,
  parseEuroCents,
  updateBudget,
  type Budget,
  type BudgetDraft,
  type BudgetScope,
  type ExpenseCategory
} from "@my-kitchen/shared";
import { getDatabase } from "./firebase";
import { useReceipts } from "./useReceipts";
import { useSettings } from "./useSettings";
import { useBudgetAlerts, useBudgets } from "./useBudgetData";

type ScopeType = BudgetScope["type"];

function scopeFromForm(type: ScopeType, categories: ExpenseCategory[]): BudgetScope {
  return type === "categories" ? { type, categories } : { type };
}

export default function BudgetsScreen() {
  const { showToast } = useToast();
  const budgets = useBudgets();
  const alerts = useBudgetAlerts();
  const receipts = useReceipts();
  const settings = useSettings();
  const [editing, setEditing] = useState<{ id: string; budget: Budget } | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<BudgetDraft["period"]>("monthly");
  const [amountEuros, setAmountEuros] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("overall");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allLoading = budgets.loading || alerts.loading || receipts.loading || settings.loading;
  const loadError = budgets.error ?? alerts.error ?? receipts.error ?? settings.error;
  const timeZone = settings.data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const discretionaryCategories = settings.data?.discretionaryCategories ?? [];
  const now = new Date();
  const parsedAmountCents = parseEuroCents(amountEuros);

  function openEditor(entry?: { id: string; budget: Budget }) {
    setEditing(entry ?? null);
    setName(entry?.budget.name ?? "");
    setPeriod(entry?.budget.period ?? "monthly");
    setAmountEuros(entry ? (entry.budget.amountCents / 100).toFixed(2) : "");
    setScopeType(entry?.budget.scope.type ?? "overall");
    setCategories(entry?.budget.scope.type === "categories" ? [...entry.budget.scope.categories] : []);
    setError(null);
    setNotice(null);
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditing(null);
  }

  async function saveBudget() {
    if (!name.trim()) {
      setError("Enter a budget name.");
      showToast("Enter a budget name.", "error");
      return;
    }
    if (parsedAmountCents === null || parsedAmountCents <= 0) {
      setError("Enter a positive budget amount in euros.");
      showToast("Enter a positive budget amount in euros.", "error");
      return;
    }
    if (scopeType === "categories" && categories.length === 0) {
      setError("Choose at least one category.");
      showToast("Choose at least one category.", "error");
      return;
    }
    const draft: BudgetDraft = {
      name: name.trim(),
      period,
      amountCents: parsedAmountCents,
      scope: scopeFromForm(scopeType, categories),
      active: editing?.budget.active ?? true
    };
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateBudget(getDatabase(), editing.id, draft);
      else await createBudget(getDatabase(), draft);
      closeEditor();
      setNotice(editing ? "Budget updated." : "Budget created.");
      showToast(editing ? "Budget updated." : "New budget added.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, budget: Budget) {
    try {
      await updateBudget(getDatabase(), id, { ...budget, active: !budget.active });
      setError(null);
      showToast(budget.active ? "Budget paused." : "Budget activated.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  function removeBudget(id: string, budgetName: string) {
    Alert.alert("Delete budget?", `Delete "${budgetName}"? Existing alerts will be kept.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteBudget(getDatabase(), id).then(
            () => showToast("Budget deleted."),
            (caught: unknown) => {
              const message = caught instanceof Error ? caught.message : String(caught);
              setError(message);
              showToast(message, "error");
            }
          );
        }
      }
    ]);
  }

  async function toggleRead(id: string, read: boolean) {
    try {
      await markBudgetAlertRead(getDatabase(), id, !read);
      showToast(read ? "Budget alert marked unread." : "Budget alert marked read.", "info");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  if (allLoading) return <View style={styles.center}><Text style={styles.muted}>Loading budgets…</Text></View>;
  if (loadError) return <View style={styles.page}><Text accessibilityRole="alert" style={styles.error}>Could not load budgets: {loadError}</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}><Text style={styles.eyebrow}>PLAN YOUR SPENDING</Text><Text style={styles.title}>Budgets</Text></View>
        <Pressable accessibilityRole="button" onPress={() => openEditor()} style={styles.primaryButton}><Text style={styles.primaryText}>＋ Add</Text></Pressable>
      </View>
      <Text style={styles.subtitle}>Weekly or monthly limits, with alerts starting at 70%.</Text>
      {notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {settings.data && !settings.data.budgetAlertsEnabled && <Text style={styles.warning}>Budget alerts are off in Settings. Current spending is still shown.</Text>}

      {budgets.data?.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No budgets yet</Text><Text style={styles.muted}>Create a budget to track spending by period or category.</Text></View>
        : budgets.data?.map(({ id, budget }) => {
          const currentReceipts = filterReceiptsByPeriod(receipts.data ?? [], now, budget.period, timeZone)
            .map(({ receipt }) => receipt);
          const spentCents = getBudgetSpendCents(currentReceipts, budget.scope, discretionaryCategories);
          const progress = spentCents / budget.amountCents * 100;
          return <View key={id} style={[styles.card, !budget.active && styles.inactiveCard]}>
            <View style={styles.budgetHeader}>
              <View style={{ flex: 1 }}><Text style={styles.periodLabel}>{budget.period === "weekly" ? "WEEKLY" : "MONTHLY"} BUDGET</Text><Text style={styles.budgetName}>{budget.name}</Text></View>
              <Text style={budget.active ? styles.activeStatus : styles.pausedStatus}>{budget.active ? "Active" : "Paused"}</Text>
            </View>
            <Text style={styles.scope}>{budgetScopeLabel(budget.scope)}</Text>
            <View style={styles.amountRow}><Text style={styles.spent}>{formatCents(spentCents)}</Text><Text style={styles.limit}>of {formatCents(budget.amountCents)}</Text><Text style={styles.percent}>{Math.round(progress)}%</Text></View>
            <View accessibilityLabel={`${budget.name}: ${Math.round(progress)} percent used`} style={styles.progressTrack}>
              <View style={[styles.progressFill, progress >= 100 ? styles.progressOver : progress >= 80 ? styles.progressNear : null, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => openEditor({ id, budget })} style={styles.actionButton}>
                <Text style={styles.actionText}>✎  Edit</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void toggleActive(id, budget)} style={styles.actionButton}>
                <Text style={styles.actionText}>{budget.active ? "Ⅱ  Pause" : "▶  Activate"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => removeBudget(id, budget.name)} style={[styles.actionButton, styles.destructiveAction]}>
                <Text style={styles.deleteText}>⌫  Delete</Text>
              </Pressable>
            </View>
          </View>;
        })}

      <View style={styles.alertHeading}><Text style={styles.eyebrow}>BUDGET ACTIVITY</Text><Text style={styles.sectionTitle}>Alerts</Text></View>
      {!alerts.data?.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>No budget alerts</Text><Text style={styles.muted}>Alerts appear when an active budget reaches a warning threshold, starting at 70%.</Text></View>
        : [...alerts.data].sort((a, b) => b.alert.createdAt.toMillis() - a.alert.createdAt.toMillis()).map(({ id, alert }) => (
          <View key={id} style={[styles.alertCard, !alert.read && styles.unreadAlert]}>
            <View style={{ flex: 1 }}><Text style={styles.budgetName}>{alert.budgetName}: {alert.thresholdPercent}% reached</Text><Text style={styles.scope}>{formatCents(alert.spentCents)} of {formatCents(alert.amountCents)} · {alert.periodKey}</Text></View>
            <Pressable accessibilityRole="button" onPress={() => void toggleRead(id, alert.read)} style={styles.actionButton}>
              <Text style={styles.actionText}>{alert.read ? "◉  Unread" : "✓  Read"}</Text>
            </Pressable>
          </View>
        ))}

      <Modal animationType="slide" onRequestClose={closeEditor} transparent visible={showEditor}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.eyebrow}>{editing ? "EDIT BUDGET" : "NEW BUDGET"}</Text>
              <Text style={styles.dialogTitle}>{editing ? "Update budget" : "Create a budget"}</Text>
              <Text style={styles.label}>Name</Text>
              <TextInput accessibilityLabel="Budget name" maxLength={100} onChangeText={setName} placeholder="e.g. Monthly groceries" style={styles.input} value={name} />
              <Text style={styles.label}>Amount (€)</Text>
              <TextInput accessibilityLabel="Budget amount in euros" keyboardType="decimal-pad" onChangeText={setAmountEuros} style={styles.input} value={amountEuros} />
              <Text style={styles.label}>Period</Text>
              <RNPickerSelect
                onValueChange={(value: BudgetDraft["period"] | null) => { if (value) setPeriod(value); }}
                items={[{ label: "Weekly", value: "weekly" }, { label: "Monthly", value: "monthly" }]}
                value={period}
                style={pickerSelectStyle}
                useNativeAndroidPickerStyle={false}
                Icon={() => <Text style={styles.pickerChevron}>⌄</Text>}
              />
              <Text style={styles.label}>Applies to</Text>
              <RNPickerSelect
                onValueChange={(value: ScopeType | null) => { if (value) setScopeType(value); }}
                items={[
                  { label: "All spending", value: "overall" },
                  { label: "Selected categories", value: "categories" },
                  { label: "Discretionary categories", value: "discretionary" }
                ]}
                value={scopeType}
                style={pickerSelectStyle}
                useNativeAndroidPickerStyle={false}
                Icon={() => <Text style={styles.pickerChevron}>⌄</Text>}
              />
              {scopeType === "categories" && expenseCategories.map((category) => (
                <View style={styles.categoryRow} key={category}><Text style={styles.rowText}>{category}</Text><Switch accessibilityLabel={`Include ${category}`} onValueChange={(checked) => setCategories((current) => checked ? [...current, category] : current.filter((entry) => entry !== category))} trackColor={{ true: "#8bc29d" }} value={categories.includes(category)} /></View>
              ))}
              {scopeType === "discretionary" && <Text style={styles.muted}>Categories from Settings: {discretionaryCategories.length ? discretionaryCategories.join(", ") : "none selected"}.</Text>}
              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <View style={styles.formActions}>
                <Pressable accessibilityRole="button" onPress={closeEditor} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveBudget()} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? "Saving…" : editing ? "Save changes" : "Create budget"}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f5f8f2" },
  content: { padding: 18, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f8f2" },
  heading: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#26392e", fontSize: 28, fontWeight: "800", marginTop: 4 },
  primaryButton: { backgroundColor: "#31835d", borderRadius: 9, paddingVertical: 10, paddingHorizontal: 13 },
  primaryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  subtitle: { color: "#748078", fontSize: 12, lineHeight: 18, marginBottom: 15 },
  success: { color: "#24693f", backgroundColor: "#e7f5e9", padding: 10, borderRadius: 8, marginBottom: 10 },
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8, marginBottom: 10 },
  warning: { color: "#895a12", backgroundColor: "#fff4df", borderRadius: 9, padding: 10, fontSize: 11, marginBottom: 10 },
  empty: { backgroundColor: "#fff", borderRadius: 14, alignItems: "center", padding: 20, marginBottom: 12 },
  emptyTitle: { color: "#26392e", fontSize: 15, fontWeight: "700" },
  muted: { color: "#748078", fontSize: 11, lineHeight: 17, marginTop: 5 },
  card: { backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 13, padding: 14, marginBottom: 9 },
  inactiveCard: { opacity: 0.7 },
  budgetHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  periodLabel: { color: "#7e9c88", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  budgetName: { color: "#2e4035", fontSize: 14, fontWeight: "700", marginTop: 3 },
  activeStatus: { color: "#267145", fontSize: 10, fontWeight: "700" },
  pausedStatus: { color: "#89928b", fontSize: 10, fontWeight: "700" },
  scope: { color: "#748078", fontSize: 10, marginTop: 5 },
  amountRow: { flexDirection: "row", alignItems: "baseline", marginTop: 12, gap: 5 },
  spent: { color: "#26392e", fontSize: 18, fontWeight: "800" },
  limit: { color: "#748078", fontSize: 11, flex: 1 },
  percent: { color: "#394b3e", fontSize: 11, fontWeight: "700" },
  progressTrack: { height: 7, backgroundColor: "#edf2ed", borderRadius: 6, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%", backgroundColor: "#63a878", borderRadius: 6 },
  progressNear: { backgroundColor: "#d19a3a" },
  progressOver: { backgroundColor: "#bb5a4d" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
  actionButton: { backgroundColor: "#edf4ed", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  destructiveAction: { backgroundColor: "#fff0ee" },
  actionText: { color: "#226b4a", fontSize: 11, fontWeight: "700" },
  deleteText: { color: "#a33f37", fontSize: 11, fontWeight: "700" },
  alertHeading: { marginTop: 22, marginBottom: 10 },
  sectionTitle: { color: "#26392e", fontSize: 19, fontWeight: "800", marginTop: 4 },
  alertCard: { backgroundColor: "#fff", borderRadius: 11, borderWidth: 1, borderColor: "#e8eee8", padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  unreadAlert: { borderColor: "#a9cfb1", backgroundColor: "#f6fbf5" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(21,36,26,.36)" },
  dialog: { maxHeight: "92%", backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  dialogTitle: { color: "#26392e", fontSize: 22, fontWeight: "800", marginVertical: 8 },
  label: { color: "#69766d", fontSize: 11, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  pickerChevron: { color: "#748078", fontSize: 18, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "#dfe7df", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, color: "#273a2e", backgroundColor: "#fff" },
  categoryRow: { minHeight: 42, borderTopColor: "#eff2ef", borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowText: { color: "#394b3e", fontSize: 11, flex: 1 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, marginTop: 18 },
  secondaryButton: { backgroundColor: "#edf2ed", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: "#47584c", fontWeight: "600" }
});
