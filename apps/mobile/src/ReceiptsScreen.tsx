import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Camera, CameraView } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { httpsCallable } from "firebase/functions";
import { useFocusEffect } from "expo-router";
import RNPickerSelect from "react-native-picker-select";
import { pickerSelectStyle } from "./pickerStyles";
import { useToast } from "./toast";
import {
  classifyLineItem,
  markItemsReceiptRecorded,
  filterReceiptsByPeriod,
  createReceipt,
  dedupeHash,
  deleteReceipt,
  expenseCategories,
  getExpensePeriodBounds,
  getExpensePeriodLabel,
  formatCents,
  formatQuantity,
  isUnreceiptedPurchase,
  unreceiptedPurchaseItems,
  isValidDateKey,
  isValidTime,
  parseEuroCents,
  parseQuantity,
  receiptsToCsv,
  shiftExpensePeriod,
  summarizeExpenses,
  updateReceipt,
  type ExpenseCategory,
  type ExpenseNecessity,
  type ExpensePeriod,
  type PaymentMethod,
  type Receipt,
  type ReceiptDraft,
  type ReceiptLineItem,
  type ScannedReceipt
} from "@my-kitchen/shared";
import { getCloudFunctions, getDatabase } from "./firebase";
import { useSettings } from "./useSettings";
import { useReceipts } from "./useReceipts";
import { useItems } from "./useItems";

interface ScanReceiptRequest {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
}

interface ReceiptImage {
  uri: string;
  width: number;
  height: number;
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ReceiptsScreen() {
  const { showToast } = useToast();
  const receipts = useReceipts();
  const settings = useSettings();
  const items = useItems();
  useFocusEffect(useCallback(() => {
    void Promise.all([receipts.refresh(), settings.refresh(), items.refresh()]);
  }, [items.refresh, receipts.refresh, settings.refresh]));
  const [review, setReview] = useState<ScannedReceipt | null>(null);
  const [source, setSource] = useState<"scan" | "manual">("manual");
  const [storeName, setStoreName] = useState("");
  const [purchaseDateKey, setPurchaseDateKey] = useState(localDateKey());
  const [purchaseTime, setPurchaseTime] = useState("");
  const [totalEuros, setTotalEuros] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [lineAmountInputs, setLineAmountInputs] = useState<string[]>([]);
  const [lineQuantityInputs, setLineQuantityInputs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const captureInProgress = useRef(false);
  const pendingCapture = useRef<ReceiptImage | null>(null);
  const screenFocused = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [purchaseItemSelection, setPurchaseItemSelection] = useState<string[] | null>(null);
  const [receiptPurchaseItemIds, setReceiptPurchaseItemIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [period, setPeriod] = useState<ExpensePeriod>("monthly");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    return () => {
      screenFocused.current = false;
      setCameraOpen(false);
      pendingCapture.current = null;
    };
  }, []));

  const parsedTotalCents = parseEuroCents(totalEuros);
  const totalCents = parsedTotalCents ?? 0;
  const linesTotalCents = lineItems.reduce((sum, line) => sum + line.amountCents, 0);
  const pendingPurchaseItems = unreceiptedPurchaseItems(items.data ?? [], now);
  const selectedPurchaseItemIds = purchaseItemSelection === null
    ? pendingPurchaseItems.map(({ id }) => id)
    : pendingPurchaseItems.filter(({ id }) => purchaseItemSelection.includes(id)).map(({ id }) => id);
  const selectedPurchaseItems = pendingPurchaseItems.filter(({ id }) => selectedPurchaseItemIds.includes(id));
  const hasUnreceiptedPurchases = pendingPurchaseItems.length > 0;
  const timeZone = settings.data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const periodReceipts = filterReceiptsByPeriod(receipts.data ?? [], selectedDate, period, timeZone);
  const summary = summarizeExpenses(periodReceipts);
  const periodLabel = getExpensePeriodLabel(selectedDate, period, timeZone);
  const periodKey = getExpensePeriodBounds(selectedDate, period, timeZone).key;
  const currentPeriodKey = getExpensePeriodBounds(new Date(), period, timeZone).key;
  const largestCategoryAmount = Math.max(1, ...summary.categories.map((entry) => Math.abs(entry.amountCents)));
  const duplicate = receipts.data?.some(({ id, receipt }) => (
    id !== editingReceiptId &&
    receipt.dedupeHash === dedupeHash(storeName, purchaseDateKey, totalCents)
  )) ?? false;

  function startManualEntry() {
    const today = selectedPurchaseItems[0]?.item.boughtAt
      ? localDateKey(selectedPurchaseItems[0].item.boughtAt.toDate())
      : localDateKey();
    setReceiptPurchaseItemIds(selectedPurchaseItemIds);
    const purchasedToday = selectedPurchaseItems
      .map(({ item }) => ({
        rawName: item.name,
        name: item.name,
        quantity: item.quantity,
        amountCents: 0,
        category: item.category,
        necessity: classifyLineItem(item.name, settings.data?.discretionaryCategories).necessity
      }));
    const initialLineItems: ReceiptLineItem[] = purchasedToday.length > 0
      ? purchasedToday
      : [{
          rawName: "", name: "", quantity: 1, amountCents: 0, category: "Groceries", necessity: "essential"
        }];
    setEditingReceiptId(null);
    setSource("manual");
    setReview({
      storeName: "",
      purchaseDateKey: today,
      totalCents: 0,
      lineItems: initialLineItems,
      confidence: 1,
      warnings: []
    });
    setStoreName("");
    setPurchaseDateKey(today);
    setPurchaseTime("");
    setTotalEuros("");
    setPaymentMethod("");
    setLineItems(initialLineItems);
    setLineQuantityInputs(initialLineItems.map((line) => formatQuantity(line.quantity)));
    setLineAmountInputs(initialLineItems.map((line) => line.amountCents > 0 ? (line.amountCents / 100).toFixed(2) : ""));
    setError(null);
    setNotice(items.error
      ? `Shopping list could not be loaded: ${items.error}`
      : purchasedToday.length > 0
        ? `Added ${purchasedToday.length} selected item${purchasedToday.length === 1 ? "" : "s"}. Enter their prices for this bill.`
        : null);
  }

  function togglePurchaseItem(itemId: string) {
    setPurchaseItemSelection((current) => {
      const selected = current ?? pendingPurchaseItems.map(({ id }) => id);
      return selected.includes(itemId)
        ? selected.filter((id) => id !== itemId)
        : [...selected, itemId];
    });
  }

  async function scanAsset(asset: ReceiptImage) {
    if (scanning) return;
    setReceiptPurchaseItemIds(selectedPurchaseItemIds);
    setScanning(true);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const actions: ImageManipulator.Action[] = asset.width > 1568 || asset.height > 1568
        ? [{ resize: asset.width >= asset.height ? { width: 1568 } : { height: 1568 } }]
        : [];
      const compressed = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        base64: true,
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG
      });
      if (!compressed.base64) throw new Error("Could not encode the receipt image.");
      const scanner = httpsCallable<ScanReceiptRequest, ScannedReceipt>(getCloudFunctions(), "scanReceipt");
      const result = await scanner({
        imageBase64: compressed.base64,
        mimeType: "image/jpeg"
      });
      const scannedDuplicate = receipts.data?.some(({ receipt }) => (
        receipt.dedupeHash === dedupeHash(
          result.data.storeName,
          result.data.purchaseDateKey,
          result.data.totalCents
        )
      )) ?? false;
      setSource("scan");
      setEditingReceiptId(null);
      setReview(result.data);
      setStoreName(result.data.storeName);
      setPurchaseDateKey(result.data.purchaseDateKey);
      setPurchaseTime(result.data.purchaseTime ?? "");
      setTotalEuros((result.data.totalCents / 100).toFixed(2));
      setPaymentMethod(result.data.paymentMethod ?? "");
      setLineItems(result.data.lineItems);
      setLineQuantityInputs(result.data.lineItems.map((line) => formatQuantity(line.quantity)));
      setLineAmountInputs(result.data.lineItems.map((line) => (line.amountCents / 100).toFixed(2)));
      setNotice(scannedDuplicate
        ? "This receipt appears to have already been saved. Check existing expenses before saving to avoid a duplicate."
        : "Review every field before saving. Receipt images are not stored.");
      showToast(
        scannedDuplicate
          ? "This receipt appears to have already been saved. Check existing expenses before saving."
          : "Receipt scanned. Review the details before saving.",
        scannedDuplicate ? "error" : "info"
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setScanning(false);
      setBusy(false);
    }
  }

  async function chooseImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const message = "Photo library permission is needed to choose a receipt.";
        setError(message);
        showToast(message, "error");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) {
        setError("The selected image could not be loaded.");
        showToast("The selected image could not be loaded.", "error");
        return;
      }
      await scanAsset(asset);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  async function openCamera() {
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
      if (!screenFocused.current) return;
      if (!permission.granted) {
        const message = "Camera permission is needed to photograph a receipt. Allow it in your device settings, or choose a photo.";
        setError(message);
        showToast(message, "error");
        return;
      }
      setCameraReady(false);
      setCameraError(null);
      setCameraOpen(true);
    } catch (caught) {
      const message = `Could not open the camera: ${caught instanceof Error ? caught.message : String(caught)}`;
      setError(message);
      showToast(message, "error");
    }
  }

  function scanPendingCapture() {
    const image = pendingCapture.current;
    pendingCapture.current = null;
    if (image) void scanAsset(image);
  }

  async function captureReceipt() {
    if (!cameraReady || !cameraRef.current || captureInProgress.current) return;
    captureInProgress.current = true;
    setCapturing(true);
    try {
      const image = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!screenFocused.current) return;
      if (!image?.uri || !image.width || !image.height) throw new Error("The captured image could not be loaded.");
      pendingCapture.current = image;
      setCameraOpen(false);
      if (Platform.OS !== "ios") scanPendingCapture();
    } catch (caught) {
      setCameraError(`Could not capture the receipt: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      captureInProgress.current = false;
      setCapturing(false);
    }
  }

  function openScanner() {
    setError(null);
    Alert.alert("Scan a receipt", "Choose how to add the receipt image.", [
      { text: "Cancel", style: "cancel" },
      { text: "Take photo", onPress: () => { void openCamera(); } },
      { text: "Choose photo", onPress: () => { void chooseImage(); } }
    ]);
  }

  function updateLine(index: number, changes: Partial<ReceiptLineItem>) {
    setLineItems((current) => current.map((line, lineIndex) => (
      index === lineIndex ? { ...line, ...changes } : line
    )));
  }

  function updateLineAmount(index: number, value: string) {
    setLineAmountInputs((current) => current.map((amount, amountIndex) => amountIndex === index ? value : amount));
    const amountCents = parseEuroCents(value);
    if (amountCents !== null) updateLine(index, { amountCents });
  }

  function updateLineName(index: number, name: string) {
    const fallback = classifyLineItem(name);
    updateLine(index, { name, rawName: name, category: fallback.category, necessity: fallback.necessity });
  }

  function startEditingReceipt(id: string, receipt: Receipt) {
    setEditingReceiptId(id);
    setReceiptPurchaseItemIds([]);
    setSource(receipt.source);
    setReview({
      storeName: receipt.storeName,
      purchaseDateKey: receipt.purchaseDateKey,
      ...(receipt.purchaseTime ? { purchaseTime: receipt.purchaseTime } : {}),
      totalCents: receipt.totalCents,
      ...(receipt.paymentMethod ? { paymentMethod: receipt.paymentMethod } : {}),
      lineItems: receipt.lineItems.map((line) => ({ ...line })),
      confidence: 1,
      warnings: []
    });
    setStoreName(receipt.storeName);
    setPurchaseDateKey(receipt.purchaseDateKey);
    setPurchaseTime(receipt.purchaseTime ?? "");
    setTotalEuros((receipt.totalCents / 100).toFixed(2));
    setPaymentMethod(receipt.paymentMethod ?? "");
    setLineItems(receipt.lineItems.map((line) => ({ ...line })));
    setLineQuantityInputs(receipt.lineItems.map((line) => formatQuantity(line.quantity)));
    setLineAmountInputs(receipt.lineItems.map((line) => (line.amountCents / 100).toFixed(2)));
    setError(null);
    setNotice(null);
  }

  function closeEditor() {
    setReview(null);
    setEditingReceiptId(null);
    setReceiptPurchaseItemIds([]);
  }

  async function saveReceipt() {
    if (!storeName.trim()) {
      setError("Enter the store name.");
      showToast("Enter the store name.", "error");
      return;
    }
    if (!isValidDateKey(purchaseDateKey)) {
      setError("Enter a valid purchase date.");
      showToast("Enter a valid purchase date.", "error");
      return;
    }
    if (parsedTotalCents === null || parsedTotalCents < 0) {
      setError("Enter a valid receipt total in euros.");
      showToast("Enter a valid receipt total in euros.", "error");
      return;
    }
    if (purchaseTime && !isValidTime(purchaseTime)) {
      setError("Enter a valid purchase time.");
      showToast("Enter a valid purchase time.", "error");
      return;
    }
    if (lineItems.length === 0 || lineItems.some((line) => !line.name.trim())) {
      setError("Add a name for every receipt line.");
      showToast("Add a name for every receipt line.", "error");
      return;
    }
    if (lineItems.some((_, index) => {
      const quantity = parseQuantity(lineQuantityInputs[index] ?? "");
      return quantity === null || quantity === 0;
    })) {
      setError("Enter a quantity above 0 and up to 9999, with at most 9 decimal places for every receipt line.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const receipt: ReceiptDraft = {
        source,
        storeName: storeName.trim(),
        purchaseDateKey,
        ...(purchaseTime ? { purchaseTime } : {}),
        totalCents,
        currency: "EUR",
        ...(paymentMethod ? { paymentMethod } : {}),
        lineItems: lineItems.map((line) => ({ ...line, name: line.name.trim(), rawName: line.rawName.trim() })),
        dedupeHash: dedupeHash(storeName, purchaseDateKey, totalCents)
      };
      if (editingReceiptId) {
        await updateReceipt(getDatabase(), editingReceiptId, receipt);
      } else {
        await createReceipt(getDatabase(), receipt);
      }
      let receiptNotice = editingReceiptId ? "Receipt updated." : "Receipt saved. It will sync to your other devices.";
      let toastNotice = editingReceiptId ? "Expense updated." : "Expense saved.";
      if (receiptPurchaseItemIds.length > 0) {
        const purchasedItemIds = (items.data ?? [])
          .filter(({ id, item }) => receiptPurchaseItemIds.includes(id) && isUnreceiptedPurchase(item))
          .map(({ id }) => id);
        try {
          await markItemsReceiptRecorded(getDatabase(), purchasedItemIds);
          if (purchasedItemIds.length > 0) {
            receiptNotice += " Purchased items were removed from the shopping list.";
            toastNotice += " Purchased items were cleared from Shopping List.";
          }
        } catch (caught) {
          const message = `Receipt was saved, but the shopping list could not be updated: ${caught instanceof Error ? caught.message : String(caught)}`;
          setError(message);
          showToast(message, "error");
        }
      }
      closeEditor();
      setPurchaseItemSelection(null);
      setNotice(receiptNotice);
      showToast(toastNotice);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("CSV sharing is not available on this device.");
      }
      if (!FileSystem.cacheDirectory) throw new Error("A temporary folder is not available for the CSV export.");
      const uri = `${FileSystem.cacheDirectory}my-kitchen-expenses-${periodKey}.csv`;
      await FileSystem.writeAsStringAsync(uri, `\uFEFF${receiptsToCsv(periodReceipts)}`, {
        encoding: FileSystem.EncodingType.UTF8
      });
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Export expenses CSV",
        UTI: "public.comma-separated-values-text"
      });
      showToast("Expenses exported to CSV.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  function removeReceipt(id: string, store: string) {
    Alert.alert("Delete receipt?", `Remove the receipt from ${store}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteReceipt(getDatabase(), id).then(
            () => showToast("Expense deleted."),
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

  if (receipts.loading) return <View style={styles.center}><Text style={styles.muted}>Loading receipts…</Text></View>;
  if (receipts.error) return <View style={styles.page}><Text accessibilityRole="alert" style={styles.error}>Could not load receipts: {receipts.error}</Text></View>;

  return (
    <>
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR SPENDING</Text>
          <Text style={styles.title}>Expenses</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: items.loading || !hasUnreceiptedPurchases || busy }}
          disabled={items.loading || !hasUnreceiptedPurchases || busy}
          onPress={openScanner}
          style={[styles.primaryButton, (!hasUnreceiptedPurchases || items.loading) && styles.disabledActionButton]}
        >
          <Text style={styles.primaryText}>{busy ? "Reading…" : "Scan"}</Text>
        </Pressable>
      </View>
      {pendingPurchaseItems.length > 0 && (
        <View style={styles.purchaseBatchPicker}>
          <View style={styles.purchaseSelectionHeading}>
            <Text style={styles.purchaseSelectionTitle}>Items for this bill</Text>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(review) || busy}
              onPress={() => setPurchaseItemSelection(
                selectedPurchaseItemIds.length === pendingPurchaseItems.length
                  ? []
                  : pendingPurchaseItems.map(({ id }) => id)
              )}
            >
              <Text style={styles.purchaseSelectionAction}>
                {selectedPurchaseItemIds.length === pendingPurchaseItems.length ? "Clear selection" : "Select all"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.purchaseItemList}>
            {pendingPurchaseItems.map(({ id, item }) => {
              const selected = selectedPurchaseItemIds.includes(id);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: Boolean(review) || busy }}
                  disabled={Boolean(review) || busy}
                  onPress={() => togglePurchaseItem(id)}
                  style={styles.purchaseItemOption}
                >
                  <Text style={styles.purchaseItemCheck}>{selected ? "☑" : "□"}</Text>
                  <Text style={styles.purchaseItemName}>{item.name} ×{formatQuantity(item.quantity)}</Text>
                  <Text style={styles.purchaseItemTime}>{item.boughtAt?.toDate().toLocaleTimeString() ?? "Purchased"}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.purchaseBatchHint}>
            {selectedPurchaseItemIds.length} of {pendingPurchaseItems.length} purchased items selected. Saving a receipt clears only selected items.
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: items.loading || !hasUnreceiptedPurchases }}
        disabled={items.loading || !hasUnreceiptedPurchases}
        onPress={startManualEntry}
        style={[styles.manualButton, (!hasUnreceiptedPurchases || items.loading) && styles.disabledManualButton]}
      >
        <Text style={[styles.manualText, (!hasUnreceiptedPurchases || items.loading) && styles.disabledManualText]}>
          {items.loading ? "Loading shopping list…" : "＋ Add expense manually"}
        </Text>
      </Pressable>
      {!items.loading && !hasUnreceiptedPurchases && (
        <Text style={styles.disabledHint}>
          {items.error ? "Shopping list could not be loaded." : "Mark shopping-list items as bought to enable receipt entry."}
        </Text>
      )}
      <Text style={styles.tips}>Flatten the receipt, use good light, and keep the whole receipt in frame.</Text>
      {notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

      <View style={styles.expenseOverview}>
        <View style={styles.periodTabs}>
          {(["day", "weekly", "monthly"] as const).map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }} onPress={() => setPeriod(value)} style={[styles.periodTab, period === value && styles.periodTabActive]}>
              <Text style={[styles.periodTabText, period === value && styles.periodTabTextActive]}>{value === "day" ? "Day" : value === "weekly" ? "Week" : "Month"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.periodNavigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => setSelectedDate((date) => shiftExpensePeriod(date, period, -1))} style={styles.periodArrow}>
            <Text style={styles.periodArrowText}>‹</Text>
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.periodLabel}>{periodLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next period" disabled={periodKey >= currentPeriodKey} onPress={() => setSelectedDate((date) => shiftExpensePeriod(date, period, 1))} style={styles.periodArrow}>
            <Text style={[styles.periodArrowText, periodKey >= currentPeriodKey && styles.disabledText]}>›</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={periodKey === currentPeriodKey} onPress={() => setSelectedDate(new Date())} style={styles.todayButton}>
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        </View>
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Total spent</Text><Text style={styles.summaryValue}>{formatCents(summary.totalCents)}</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Receipts</Text><Text style={styles.summaryValue}>{summary.receiptCount}</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Line items</Text><Text style={styles.summaryValue}>{formatCents(summary.lineItemsTotalCents)}</Text></View>
        </View>
        <Text style={styles.categoryHeading}>Spending by category</Text>
        {summary.categories.length === 0 ? <Text style={styles.muted}>No expenses in this period.</Text> : summary.categories.map(({ category, amountCents }) => (
          <View key={category} style={styles.categoryRow}>
            <View style={styles.categoryLabelRow}><Text style={styles.categoryName}>{category}</Text><Text style={styles.categoryAmount}>{formatCents(amountCents)}</Text></View>
            <View accessibilityLabel={`${category}: ${formatCents(amountCents)}`} style={styles.categoryTrack}>
              <View style={[styles.categoryFill, { width: `${Math.min(100, Math.abs(amountCents) / largestCategoryAmount * 100)}%` }]} />
            </View>
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={() => void exportCsv()} style={styles.exportButton}>
          <Text style={styles.exportText}>Export period as CSV</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Receipts</Text>
      {periodReceipts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No expenses in this period</Text>
          <Text style={styles.muted}>Choose another period or add a receipt.</Text>
        </View>
      ) : <View style={styles.receiptList}>
        {[...periodReceipts].sort((a, b) => b.receipt.purchaseDateKey.localeCompare(a.receipt.purchaseDateKey)).map(({ id, receipt }) => (
          <View key={id} style={styles.receiptCard}>
            <Pressable accessibilityRole="button" onPress={() => setExpandedReceipt(expandedReceipt === id ? null : id)} style={styles.receiptButton}>
              <View style={styles.receiptText}>
                <Text style={styles.storeName}>{receipt.storeName}</Text>
                <Text style={styles.muted}>{receipt.purchaseDateKey}{receipt.purchaseTime ? ` · ${receipt.purchaseTime}` : ""} · {receipt.lineItems.length} items</Text>
              </View>
              <Text style={styles.receiptTotal}>{formatCents(receipt.totalCents)}</Text>
            </Pressable>
            {expandedReceipt === id && <View style={styles.receiptLines}>
              {receipt.lineItems.map((line, index) => (
                <View key={`${line.name}-${index}`} style={styles.receiptLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName}>{line.name} ×{formatQuantity(line.quantity)}</Text>
                    <Text style={styles.lineMeta}>{line.category}</Text>
                  </View>
                  <Text style={styles.lineAmount}>{formatCents(line.amountCents)}</Text>
                </View>
              ))}
              <Pressable accessibilityRole="button" onPress={() => startEditingReceipt(id, receipt)} style={[styles.lineAction, styles.addLineAction]}>
                <Text style={[styles.lineActionText, styles.addLineText]}>✎  Edit receipt</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => removeReceipt(id, receipt.storeName)} style={[styles.lineAction, styles.destructiveAction]}>
                <Text style={[styles.lineActionText, styles.destructiveActionText]}>⌫  Delete receipt</Text>
              </Pressable>
            </View>}
          </View>
        ))}
      </View>}

      <Modal animationType="slide" onRequestClose={closeEditor} transparent visible={review !== null}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.eyebrow}>{editingReceiptId ? "EDIT RECEIPT" : source === "scan" ? "SCAN REVIEW" : "MANUAL ENTRY"}</Text>
              <Text style={styles.dialogTitle}>{editingReceiptId ? "Update the details" : source === "scan" ? "Check the details" : "Add an expense"}</Text>
              {source === "scan" && review?.warnings.map((warning, index) => (
                <Text key={`${warning}-${index}`} style={styles.warning}>{warning}</Text>
              ))}
              {duplicate && <Text style={styles.warning}>A receipt with this store, date, and total already exists. You can still save it.</Text>}
              <Text style={styles.label}>Store</Text>
              <TextInput accessibilityLabel="Store name" maxLength={100} onChangeText={setStoreName} placeholder="Store name" style={styles.input} value={storeName} />
              <Text style={styles.label}>Purchase date (YYYY-MM-DD)</Text>
              <TextInput accessibilityLabel="Purchase date" onChangeText={setPurchaseDateKey} style={styles.input} value={purchaseDateKey} />
              <Text style={styles.label}>Time (optional)</Text>
              <TextInput accessibilityLabel="Purchase time" onChangeText={setPurchaseTime} placeholder="HH:MM" style={styles.input} value={purchaseTime} />
              <Text style={styles.label}>Total (€)</Text>
              <TextInput accessibilityLabel="Receipt total in euros" keyboardType="decimal-pad" onChangeText={setTotalEuros} style={styles.input} value={totalEuros} />
              <Text style={styles.label}>Payment method</Text>
              <RNPickerSelect
                onValueChange={(value: PaymentMethod | null) => setPaymentMethod(value ?? "")}
                items={[
                  { label: "Not specified", value: "" },
                  { label: "Cash", value: "cash" },
                  { label: "Card", value: "card" },
                  { label: "Other", value: "other" }
                ]}
                value={paymentMethod}
                style={pickerSelectStyle}
                useNativeAndroidPickerStyle={false}
                Icon={() => <Text style={styles.pickerChevron}>⌄</Text>}
              />
              <View style={styles.sumBox}>
                <Text style={styles.sumText}>Lines: {formatCents(linesTotalCents)}</Text>
                <Text style={Math.abs(totalCents - linesTotalCents) <= 2 ? styles.sumOk : styles.sumDiff}>
                  {Math.abs(totalCents - linesTotalCents) <= 2 ? "Matches total" : `Difference: ${formatCents(totalCents - linesTotalCents)}`}
                </Text>
              </View>
              {lineItems.map((line, index) => (
                <View key={index} style={styles.lineEditor}>
                  <Text style={styles.label}>Item {index + 1}</Text>
                  <TextInput accessibilityLabel={`Line ${index + 1} name`} onChangeText={(name) => updateLineName(index, name)} placeholder="Item name" style={styles.input} value={line.name} />
                  <View style={styles.lineInputRow}>
                    <TextInput accessibilityLabel={`Line ${index + 1} quantity`} keyboardType="decimal-pad" onChangeText={(value) => {
                      setLineQuantityInputs((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
                      const quantity = parseQuantity(value);
                      if (quantity !== null && quantity > 0) updateLine(index, { quantity });
                    }} placeholder="Qty" style={[styles.input, styles.flexInput]} value={lineQuantityInputs[index] ?? ""} />
                    <TextInput accessibilityLabel={`Line ${index + 1} amount in euros`} keyboardType="decimal-pad" onChangeText={(value) => updateLineAmount(index, value)} onEndEditing={() => setLineAmountInputs((current) => current.map((amount, amountIndex) => amountIndex === index ? ((lineItems[index]?.amountCents ?? 0) / 100).toFixed(2) : amount))} placeholder="€ amount" style={[styles.input, styles.flexInput]} value={lineAmountInputs[index] ?? ""} />
                  </View>
                  <Text style={styles.label}>Category</Text>
                  <RNPickerSelect
                    onValueChange={(value: ExpenseCategory | null) => {
                      if (value) updateLine(index, { category: value });
                    }}
                    items={expenseCategories.map((category) => ({ label: category, value: category }))}
                    value={line.category}
                    style={pickerSelectStyle}
                    textInputProps={{ accessibilityLabel: `Line ${index + 1} category` }}
                    useNativeAndroidPickerStyle={false}
                    Icon={() => <Text style={styles.pickerChevron}>⌄</Text>}
                  />
                  <Text style={styles.label}>Necessity</Text>
                  <RNPickerSelect
                    onValueChange={(value: ExpenseNecessity | null) => {
                      if (value) updateLine(index, { necessity: value });
                    }}
                    items={[
                      { label: "Essential", value: "essential" },
                      { label: "Discretionary", value: "discretionary" },
                      { label: "Neutral", value: "neutral" }
                    ]}
                    value={line.necessity}
                    style={pickerSelectStyle}
                    textInputProps={{ accessibilityLabel: `Line ${index + 1} necessity` }}
                    useNativeAndroidPickerStyle={false}
                    Icon={() => <Text style={styles.pickerChevron}>⌄</Text>}
                  />
                </View>
              ))}
              <Pressable accessibilityRole="button" onPress={() => {
                setLineItems((current) => [...current, {
                  rawName: "", name: "", quantity: 1, amountCents: 0, category: "Groceries", necessity: "essential"
                }]);
                setLineAmountInputs((current) => [...current, ""]);
                setLineQuantityInputs((current) => [...current, "1"]);
              }} style={[styles.lineAction, styles.addLineButton]}>
                <Text style={[styles.lineActionText, styles.addLineText]}>＋  Add line</Text>
              </Pressable>
              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <View style={styles.formActions}>
                  <Pressable accessibilityRole="button" onPress={closeEditor} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveReceipt()} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? "Saving…" : editingReceiptId ? "Update receipt" : "Save receipt"}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
    <Modal
      animationType="slide"
      visible={cameraOpen}
      onRequestClose={() => { if (!captureInProgress.current) setCameraOpen(false); }}
      onDismiss={scanPendingCapture}
    >
      <SafeAreaView style={styles.cameraScreen}>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Align your receipt</Text>
          <Text style={styles.cameraHint}>Fit the full bill inside the guide. Keep it flat and avoid glare.</Text>
        </View>
        <View style={styles.cameraPreview}>
          {cameraOpen && <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
            onMountError={({ message }) => {
              setCameraReady(false);
              setCameraError(`Could not start the camera: ${message}`);
            }}
          />}
          <View pointerEvents="none" style={styles.cameraGuide}>
            <View style={styles.cameraReceiptGuide} />
          </View>
        </View>
        {cameraError && <Text accessibilityRole="alert" style={styles.cameraError}>{cameraError}</Text>}
        <View style={styles.cameraActions}>
          <Pressable accessibilityRole="button" disabled={capturing} onPress={() => setCameraOpen(false)} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !cameraReady || capturing }} disabled={!cameraReady || capturing} onPress={() => void captureReceipt()} style={[styles.primaryButton, (!cameraReady || capturing) && styles.disabledActionButton]}>
            <Text style={styles.primaryText}>{capturing ? "Capturing…" : "Capture & scan"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
    <Modal
      animationType="fade"
      onRequestClose={() => {}}
      transparent
      visible={scanning}
    >
      <View style={styles.scanningOverlay} accessibilityRole="progressbar" accessibilityLabel="Scanning receipt image">
        <ActivityIndicator size="large" color="#31835d" />
        <Text style={styles.scanningTitle}>Scanning receipt image…</Text>
        <Text style={styles.scanningHint}>Please wait while we read the receipt.</Text>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f5f8f2", padding: 18 },
  pageContent: { flexGrow: 1, paddingBottom: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f8f2" },
  scanningOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "rgba(245,248,242,0.92)" },
  scanningTitle: { color: "#2e4035", fontSize: 16, fontWeight: "700" },
  scanningHint: { color: "#748078", fontSize: 12 },
  cameraScreen: { flex: 1, backgroundColor: "#fff", padding: 18 },
  cameraHeader: { gap: 5, paddingBottom: 14 },
  cameraTitle: { color: "#2e4035", fontSize: 17, fontWeight: "700" },
  cameraHint: { color: "#748078", fontSize: 12 },
  cameraPreview: { flex: 1, overflow: "hidden", borderRadius: 12, backgroundColor: "#101612" },
  cameraGuide: { position: "absolute", top: "5%", bottom: "5%", left: "12%", right: "12%", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cameraReceiptGuide: { height: "84%", maxWidth: "90%", aspectRatio: 0.48, borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.75)", borderRadius: 5 },
  cameraError: { color: "#a33f37", marginTop: 10 },
  cameraActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, paddingTop: 14 },
  heading: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#26392e", fontSize: 29, fontWeight: "800", marginTop: 4 },
  primaryButton: { backgroundColor: "#31835d", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 15 },
  disabledActionButton: { backgroundColor: "#c5cec6" },
  primaryText: { color: "#fff", fontWeight: "700" },
  manualButton: { alignSelf: "flex-start", backgroundColor: "#e7f1e7", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13 },
  disabledManualButton: { backgroundColor: "#e3e7e2" },
  manualText: { color: "#226b4a", fontSize: 13, fontWeight: "700" },
  disabledManualText: { color: "#89928b" },
  disabledHint: { color: "#89928b", fontSize: 11, marginTop: 7 },
  purchaseBatchPicker: { marginBottom: 14, padding: 12, borderWidth: 1, borderColor: "#e8eee8", borderRadius: 12, backgroundColor: "#fff" },
  purchaseSelectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  purchaseSelectionTitle: { color: "#394b3e", fontSize: 12, fontWeight: "700" },
  purchaseSelectionAction: { color: "#226b4a", fontSize: 11, fontWeight: "700" },
  purchaseItemList: { gap: 3, marginTop: 8 },
  purchaseItemOption: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: "#f0f3f0" },
  purchaseItemCheck: { width: 20, color: "#31835d", fontSize: 16 },
  purchaseItemName: { flex: 1, color: "#394b3e", fontSize: 12 },
  purchaseItemTime: { color: "#89928b", fontSize: 10 },
  purchaseBatchHint: { color: "#89928b", fontSize: 11, marginTop: 8 },
  tips: { color: "#748078", fontSize: 12, marginTop: 10, marginBottom: 20 },
  expenseOverview: { backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 22 },
  periodTabs: { flexDirection: "row", backgroundColor: "#f2f6f1", borderRadius: 10, padding: 3 },
  periodTab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  periodTabActive: { backgroundColor: "#fff" },
  periodTabText: { color: "#748078", fontSize: 12, fontWeight: "600" },
  periodTabTextActive: { color: "#226b4a" },
  periodNavigation: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginVertical: 9 },
  periodArrow: { paddingHorizontal: 5, paddingVertical: 3 },
  periodArrowText: { color: "#31835d", fontSize: 22 },
  periodLabel: { color: "#2e4035", fontSize: 12, fontWeight: "700" },
  todayButton: { backgroundColor: "#edf2ed", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  todayText: { color: "#47584c", fontSize: 10, fontWeight: "600" },
  disabledText: { color: "#c5cec6" },
  summaryCards: { flexDirection: "row", gap: 7, marginBottom: 13 },
  summaryCard: { flex: 1, minWidth: 0, backgroundColor: "#f7faf6", borderRadius: 9, padding: 9 },
  summaryLabel: { color: "#748078", fontSize: 9 },
  summaryValue: { color: "#26392e", fontSize: 13, fontWeight: "700", marginTop: 4 },
  categoryHeading: { color: "#26392e", fontSize: 13, fontWeight: "700", marginBottom: 9 },
  categoryRow: { marginBottom: 8 },
  categoryLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  categoryName: { color: "#59675e", fontSize: 10 },
  categoryAmount: { color: "#394b3e", fontSize: 10, fontWeight: "600" },
  categoryTrack: { height: 5, backgroundColor: "#edf2ed", borderRadius: 4, overflow: "hidden" },
  categoryFill: { height: "100%", backgroundColor: "#63a878", borderRadius: 4 },
  exportButton: { alignSelf: "flex-start", marginTop: 7, paddingVertical: 8 },
  exportText: { color: "#226b4a", fontSize: 11, fontWeight: "700" },
  sectionTitle: { color: "#26392e", fontSize: 19, fontWeight: "800", marginBottom: 12 },
  empty: { backgroundColor: "#fff", borderRadius: 16, alignItems: "center", padding: 25 },
  emptyTitle: { color: "#26392e", fontSize: 17, fontWeight: "700" },
  muted: { color: "#748078", fontSize: 11, marginTop: 5, lineHeight: 17 },
  receiptList: { gap: 9, paddingBottom: 20 },
  receiptCard: { backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 13, overflow: "hidden" },
  receiptButton: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  receiptText: { flex: 1 },
  storeName: { color: "#2e4035", fontSize: 14, fontWeight: "700" },
  receiptTotal: { color: "#2c4234", fontSize: 13, fontWeight: "700" },
  receiptLines: { borderTopColor: "#eff2ef", borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 12 },
  receiptLine: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eff2ef" },
  lineName: { color: "#394b3e", fontSize: 12 },
  lineMeta: { color: "#89928b", fontSize: 10, marginTop: 4 },
  lineAmount: { color: "#394b3e", fontSize: 12 },
  lineAction: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8 },
  lineActionText: { fontSize: 11, fontWeight: "700" },
  addLineAction: { backgroundColor: "#edf4ed" },
  addLineText: { color: "#226b4a" },
  destructiveAction: { backgroundColor: "#fff0ee" },
  destructiveActionText: { color: "#a33f37" },
  success: { color: "#24693f", backgroundColor: "#e7f5e9", padding: 10, borderRadius: 8, marginBottom: 10 },
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8, marginBottom: 10 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(21,36,26,.36)" },
  dialog: { maxHeight: "92%", backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  dialogTitle: { color: "#26392e", fontSize: 22, fontWeight: "800", marginVertical: 7 },
  label: { color: "#69766d", fontSize: 11, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  pickerChevron: { color: "#748078", fontSize: 18, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "#dfe7df", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, color: "#273a2e", backgroundColor: "#fff" },
  warning: { color: "#895a12", backgroundColor: "#fff4df", borderRadius: 9, padding: 9, fontSize: 11, marginVertical: 4 },
  sumBox: { backgroundColor: "#f2f6f1", borderRadius: 9, padding: 11, marginVertical: 12 },
  sumText: { color: "#394b3e", fontSize: 12, fontWeight: "600" },
  sumOk: { color: "#267145", fontSize: 11, marginTop: 4 },
  sumDiff: { color: "#a2611b", fontSize: 11, marginTop: 4 },
  lineEditor: { borderTopColor: "#eff2ef", borderTopWidth: 1, paddingVertical: 12 },
  lineInputRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  flexInput: { flex: 1 },
  addLineButton: { alignSelf: "flex-start", marginTop: 10 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, marginTop: 18 },
  secondaryButton: { backgroundColor: "#edf2ed", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: "#47584c", fontWeight: "600" }
});
