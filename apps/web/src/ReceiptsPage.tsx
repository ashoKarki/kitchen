import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { httpsCallable } from "firebase/functions";
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
  isUnreceiptedPurchase,
  unreceiptedPurchaseItems,
  isValidDateKey,
  isValidTime,
  parseEuroCents,
  receiptsToCsv,
  shiftExpensePeriod,
  summarizeExpenses,
  updateReceipt,
  type ExpenseCategory,
  type ExpenseNecessity,
  type ExpensePeriod,
  type PaymentMethod,
  type ReceiptDraft,
  type ReceiptLineItem,
  type ScannedReceipt
} from "@my-kitchen/shared";
import { getCloudFunctions, getDatabase } from "./firebase";
import { useItems, useReceipts, useSettings } from "./hooks";
import { useToast } from "./toast";

interface ScanReceiptRequest {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const ratio = Math.min(1, 1568 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot process receipt images.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Could not resize the receipt image."));
            return;
          }
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read the resized receipt image."));
          reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
              reject(new Error("Could not encode the receipt image."));
              return;
            }
            resolve(result.slice(result.indexOf(",") + 1));
          };
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.7);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected file is not a readable image."));
    };
    image.src = objectUrl;
  });
}

function imageFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

export default function ReceiptsPage() {
  const { showToast } = useToast();
  const receipts = useReceipts();
  const settings = useSettings();
  const items = useItems();
  const inputRef = useRef<HTMLInputElement>(null);
  const manualEntryRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const scrollToManualEntry = useRef(false);
  const [source, setSource] = useState<"scan" | "manual">("manual");
  const [review, setReview] = useState<ScannedReceipt | null>(null);
  const [storeName, setStoreName] = useState("");
  const [purchaseDateKey, setPurchaseDateKey] = useState(localDateKey());
  const [purchaseTime, setPurchaseTime] = useState("");
  const [totalEuros, setTotalEuros] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [lineAmountInputs, setLineAmountInputs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [purchaseItemSelection, setPurchaseItemSelection] = useState<string[] | null>(null);
  const [receiptPurchaseItemIds, setReceiptPurchaseItemIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [period, setPeriod] = useState<ExpensePeriod>("monthly");
  const [now, setNow] = useState(() => Date.now());

  const parsedTotalCents = parseEuroCents(totalEuros);
  const totalCents = parsedTotalCents ?? 0;
  const linesTotalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!cameraVideoRef.current || !cameraStream) return;
    cameraVideoRef.current.srcObject = cameraStream;
    void cameraVideoRef.current.play().catch((caught: unknown) => {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(`Could not start the camera preview: ${message}`);
    });
  }, [cameraStream]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!scrollToManualEntry.current || !review) return;
    scrollToManualEntry.current = false;
    const frame = window.requestAnimationFrame(() => {
      manualEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [review]);

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
          rawName: "",
          name: "",
          quantity: 1,
          amountCents: 0,
          category: "Groceries",
          necessity: "essential"
        }];
    scrollToManualEntry.current = true;
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
    setLineAmountInputs(initialLineItems.map((line) => line.amountCents > 0 ? (line.amountCents / 100).toFixed(2) : ""));
    setError(null);
    setFieldErrors({});
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

  async function scanFile(file: File | null) {
    if (!file || scanningRef.current) return;
    if (!file.type.startsWith("image/")) {
      const message = "Choose a JPEG, PNG, or other image file.";
      setError(message);
      showToast(message, "error");
      return;
    }
    if (file.size > 15_000_000) {
      const message = "The selected image is too large. Choose an image under 15 MB.";
      setError(message);
      showToast(message, "error");
      return;
    }
    setReceiptPurchaseItemIds(selectedPurchaseItemIds);
    scanningRef.current = true;
    setScanning(true);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const scanner = httpsCallable<ScanReceiptRequest, ScannedReceipt>(getCloudFunctions(), "scanReceipt");
      const result = await scanner({
        imageBase64,
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
      scanningRef.current = false;
      setScanning(false);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openCamera() {
    if (busy || !hasUnreceiptedPurchases) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "Camera access is unavailable in this browser. Choose a receipt image instead.";
      setError(message);
      showToast(message, "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraOpen(true);
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error && caught.name === "NotAllowedError"
        ? "Allow camera access in your browser settings, or choose a receipt image instead."
        : caught instanceof Error && caught.name === "NotFoundError"
          ? "No camera was found. Choose a receipt image instead."
          : `Could not open the camera: ${caught instanceof Error ? caught.message : String(caught)}`;
      setError(message);
      showToast(message, "error");
    }
  }

  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraOpen(false);
  }

  function captureCameraImage() {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      const message = "The camera is not ready yet. Please wait for the preview.";
      setError(message);
      showToast(message, "error");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      const message = "This browser cannot capture the camera image.";
      setError(message);
      showToast(message, "error");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        const message = "Could not capture the receipt image. Please try again.";
        setError(message);
        showToast(message, "error");
        return;
      }
      closeCamera();
      void scanFile(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    if (scanning) page.setAttribute("inert", "");
    else page.removeAttribute("inert");
    return () => page.removeAttribute("inert");
  }, [scanning]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (scanningRef.current) return;
      const file = imageFromClipboard(event);
      if (file) {
        event.preventDefault();
        void scanFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function updateLine(index: number, changes: Partial<ReceiptLineItem>) {
    setLineItems((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, ...changes } : line
    )));
    if ("name" in changes) clearFieldError(`line-${index}`);
  }

  function updateLineAmount(index: number, value: string) {
    setLineAmountInputs((current) => current.map((amount, amountIndex) => amountIndex === index ? value : amount));
    const amountCents = parseEuroCents(value);
    if (amountCents !== null) updateLine(index, { amountCents });
  }

  function clearFieldError(field: string) {
    setError(null);
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== field));
    });
  }

  function changeLineName(index: number, name: string) {
    const fallback = classifyLineItem(name);
    updateLine(index, { name, rawName: name, category: fallback.category, necessity: fallback.necessity });
  }

  function startEditingReceipt(id: string, receipt: NonNullable<typeof receipts.data>[number]["receipt"]) {
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
    setLineAmountInputs(receipt.lineItems.map((line) => (line.amountCents / 100).toFixed(2)));
    setError(null);
    setFieldErrors({});
    setNotice(null);
  }

  function closeEditor() {
    setReview(null);
    setEditingReceiptId(null);
    setReceiptPurchaseItemIds([]);
  }

  async function saveReceipt() {
    const validationErrors: Record<string, string> = {};
    if (!storeName.trim()) validationErrors.storeName = "Enter the store name.";
    if (!isValidDateKey(purchaseDateKey)) validationErrors.purchaseDate = "Enter a valid purchase date.";
    if (parsedTotalCents === null || parsedTotalCents < 0) {
      validationErrors.total = "Enter a valid receipt total in euros.";
    }
    if (purchaseTime && !isValidTime(purchaseTime)) validationErrors.purchaseTime = "Enter a valid purchase time.";
    if (lineItems.length === 0) validationErrors.lineItems = "Add at least one receipt line.";
    lineItems.forEach((line, index) => {
      if (!line.name.trim()) validationErrors[`line-${index}`] = "Enter an item name.";
    });
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError("Please correct the highlighted fields.");
      showToast("Please correct the highlighted fields.", "error");
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
      setFieldErrors({});
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

  async function removeReceipt(id: string) {
    if (!window.confirm("Delete this receipt? This cannot be undone.")) return;
    try {
      await deleteReceipt(getDatabase(), id);
      showToast("Expense deleted.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  function exportCsv() {
    try {
      const csv = `\uFEFF${receiptsToCsv(periodReceipts)}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `my-kitchen-expenses-${periodKey}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Expenses exported to CSV.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    void scanFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void scanFile(event.dataTransfer.files[0] ?? null);
  }

  if (receipts.loading) return <p className="message" role="status">Loading receipts…</p>;
  if (receipts.error) return <p className="error" role="alert">Could not load receipts: {receipts.error}</p>;

  return <>
  <section ref={pageRef} className="page" aria-busy={scanning}>
    <div className="page-heading">
      <div>
        <p className="eyebrow">YOUR SPENDING</p>
        <h1>Expenses</h1>
        <p className="muted">Scan a German receipt or add an expense manually.</p>
      </div>
      <div className="receipt-actions">
        <button
          className="button secondary"
          disabled={busy || items.loading || !hasUnreceiptedPurchases}
          onClick={() => void openCamera()}
          title={!items.loading && !hasUnreceiptedPurchases ? "Mark shopping-list items as bought to enable receipt entry." : undefined}
        >Use camera</button>
        <button
          className="button secondary"
          disabled={items.loading || !hasUnreceiptedPurchases}
          onClick={startManualEntry}
          title={!items.loading && !hasUnreceiptedPurchases ? "Mark shopping-list items as bought to enable receipt entry." : undefined}
        >
          {items.loading ? "Loading shopping list…" : "＋ Add manually"}
        </button>
        <button
          className="button primary"
          disabled={busy || items.loading || !hasUnreceiptedPurchases}
          onClick={() => inputRef.current?.click()}
          title={!items.loading && !hasUnreceiptedPurchases ? "Mark shopping-list items as bought to enable receipt entry." : undefined}
        >{busy ? "Reading…" : "Scan receipt"}</button>
      </div>
    </div>
    {pendingPurchaseItems.length > 0 && (
      <div className="purchase-batch-picker">
        <div className="purchase-selection-heading">
          <strong>Items for this bill</strong>
          <button
            className="text-button"
            disabled={Boolean(review) || busy}
            onClick={() => setPurchaseItemSelection(selectedPurchaseItemIds.length === pendingPurchaseItems.length ? [] : pendingPurchaseItems.map(({ id }) => id))}
          >
            {selectedPurchaseItemIds.length === pendingPurchaseItems.length ? "Clear selection" : "Select all"}
          </button>
        </div>
        <div className="purchase-item-list">
          {pendingPurchaseItems.map(({ id, item }) => (
            <label key={id} className="purchase-item-option">
              <input
                type="checkbox"
                checked={selectedPurchaseItemIds.includes(id)}
                disabled={Boolean(review) || busy}
                onChange={() => togglePurchaseItem(id)}
              />
              <span>{item.name} ×{item.quantity}</span>
              <small>{item.boughtAt?.toDate().toLocaleTimeString() ?? "Purchased"}</small>
            </label>
          ))}
        </div>
        <p>{selectedPurchaseItemIds.length} of {pendingPurchaseItems.length} purchased items selected. Saving a receipt clears only selected items.</p>
      </div>
    )}
    {!items.loading && !hasUnreceiptedPurchases && (
      <p className="disabled-action-hint">
        {items.error ? "Shopping list could not be loaded." : "Mark shopping-list items as bought to enable receipt entry."}
      </p>
    )}
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <section className="expense-overview" aria-label="Expense summary">
      <div className="period-toolbar">
        <div className="period-tabs" aria-label="Expense period">
          {(["day", "weekly", "monthly"] as const).map((value) => (
            <button key={value} className={period === value ? "period-tab active" : "period-tab"} onClick={() => setPeriod(value)}>
              {value === "day" ? "Day" : value === "weekly" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <div className="period-navigation">
          <button className="icon-button" aria-label="Previous period" onClick={() => setSelectedDate((date) => shiftExpensePeriod(date, period, -1))}>‹</button>
          <strong aria-live="polite">{periodLabel}</strong>
          <button className="icon-button" aria-label="Next period" disabled={periodKey >= currentPeriodKey} onClick={() => setSelectedDate((date) => shiftExpensePeriod(date, period, 1))}>›</button>
          <button className="button secondary small" disabled={periodKey === currentPeriodKey} onClick={() => setSelectedDate(new Date())}>Today</button>
        </div>
        <button className="button secondary small" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="expense-stat-grid">
        <article className="expense-stat"><span>Total spent</span><strong>{formatCents(summary.totalCents)}</strong></article>
        <article className="expense-stat"><span>Receipts</span><strong>{summary.receiptCount}</strong></article>
        <article className="expense-stat"><span>Line items</span><strong>{formatCents(summary.lineItemsTotalCents)}</strong></article>
      </div>
      <div className="category-summary">
        <h2>Spending by category</h2>
        {summary.categories.length === 0 ? <p className="muted">No expenses in this period.</p> : summary.categories.map(({ category, amountCents }) => (
          <div className="category-row" key={category}>
            <div className="category-row-label"><span>{category}</span><strong>{formatCents(amountCents)}</strong></div>
            <div className="category-track" role="img" aria-label={`${category}: ${formatCents(amountCents)}`}>
              <span style={{ width: `${Math.min(100, Math.abs(amountCents) / largestCategoryAmount * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
    <input ref={inputRef} accept="image/*" aria-label="Choose receipt image" className="visually-hidden" type="file" onChange={onFileChange} />
    <div
      className={`scan-drop${dragging ? " dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <span className="scan-icon">▤</span>
      <strong>Drop a receipt here, paste an image, or choose a photo</strong>
      <span>Flatten the receipt, use good light, and keep the whole receipt in frame.</span>
      <button className="text-button" onClick={() => inputRef.current?.click()}>Choose receipt image</button>
    </div>

    {review && <div ref={manualEntryRef} className="receipt-editor">
      <div className="receipt-editor-heading">
        <div><p className="eyebrow">{editingReceiptId ? "EDIT RECEIPT" : source === "scan" ? "SCAN REVIEW" : "MANUAL ENTRY"}</p><h2>{editingReceiptId ? "Update the details" : source === "scan" ? "Check the details" : "Add an expense"}</h2></div>
        <button className="icon-button" aria-label="Close receipt editor" onClick={closeEditor}>×</button>
      </div>
      {editingReceiptId && <p className="muted">Editing a saved receipt</p>}
      {source === "scan" && review.warnings.map((warning, index) => <p className="warning" key={`${warning}-${index}`}>{warning}</p>)}
      {duplicate && <p className="warning" role="status">A receipt with this store, date, and total already exists. You can still save this one.</p>}
      <div className="receipt-meta-grid">
        <label className={fieldErrors.storeName ? "field-invalid" : ""}>
          Store
          <input
            aria-describedby={fieldErrors.storeName ? "receipt-store-error" : undefined}
            aria-invalid={Boolean(fieldErrors.storeName)}
            maxLength={100}
            value={storeName}
            onChange={(event) => { setStoreName(event.target.value); clearFieldError("storeName"); }}
          />
          {fieldErrors.storeName && <span className="field-error" id="receipt-store-error">{fieldErrors.storeName}</span>}
        </label>
        <label className={fieldErrors.purchaseDate ? "field-invalid" : ""}>
          Purchase date
          <input
            aria-describedby={fieldErrors.purchaseDate ? "receipt-date-error" : undefined}
            aria-invalid={Boolean(fieldErrors.purchaseDate)}
            type="date"
            value={purchaseDateKey}
            onChange={(event) => { setPurchaseDateKey(event.target.value); clearFieldError("purchaseDate"); }}
          />
          {fieldErrors.purchaseDate && <span className="field-error" id="receipt-date-error">{fieldErrors.purchaseDate}</span>}
        </label>
        <label className={fieldErrors.purchaseTime ? "field-invalid" : ""}>
          Time (optional)
          <input
            aria-describedby={fieldErrors.purchaseTime ? "receipt-time-error" : undefined}
            aria-invalid={Boolean(fieldErrors.purchaseTime)}
            type="time"
            value={purchaseTime}
            onChange={(event) => { setPurchaseTime(event.target.value); clearFieldError("purchaseTime"); }}
          />
          {fieldErrors.purchaseTime && <span className="field-error" id="receipt-time-error">{fieldErrors.purchaseTime}</span>}
        </label>
        <label className={fieldErrors.total ? "field-invalid" : ""}>
          Total (€)
          <input
            aria-describedby={fieldErrors.total ? "receipt-total-error" : undefined}
            aria-invalid={Boolean(fieldErrors.total)}
            min="0"
            step="0.01"
            type="number"
            value={totalEuros}
            onChange={(event) => { setTotalEuros(event.target.value); clearFieldError("total"); }}
          />
          {fieldErrors.total && <span className="field-error" id="receipt-total-error">{fieldErrors.total}</span>}
        </label>
        <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | "")}>
          <option value="">Not specified</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option>
        </select></label>
      </div>
      <div className="sum-banner" aria-live="polite">
        Line items total: <strong>{formatCents(linesTotalCents)}</strong>
        <span>Receipt total: {formatCents(totalCents)}</span>
        <span className={Math.abs(linesTotalCents - totalCents) <= 2 ? "sum-ok" : "sum-diff"}>
          Difference: {formatCents(totalCents - linesTotalCents)}
        </span>
      </div>
      <div className="receipt-lines">
        {lineItems.map((line, index) => <div className="receipt-line-edit" key={index}>
          <label className={fieldErrors[`line-${index}`] ? "field-invalid" : ""}>
            Item
            <input
              aria-describedby={fieldErrors[`line-${index}`] ? `receipt-line-${index}-error` : undefined}
              aria-invalid={Boolean(fieldErrors[`line-${index}`])}
              aria-label={`Line ${index + 1} name`}
              value={line.name}
              onChange={(event) => changeLineName(index, event.target.value)}
            />
            {fieldErrors[`line-${index}`] && <span className="field-error" id={`receipt-line-${index}-error`}>{fieldErrors[`line-${index}`]}</span>}
          </label>
          <label>Qty<input aria-label={`Line ${index + 1} quantity`} min="1" step="1" type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <label>Amount (€)<input aria-label={`Line ${index + 1} amount in euros`} inputMode="decimal" type="text" value={lineAmountInputs[index] ?? ""} onChange={(event) => updateLineAmount(index, event.target.value)} onBlur={() => setLineAmountInputs((current) => current.map((amount, amountIndex) => amountIndex === index ? ((lineItems[index]?.amountCents ?? 0) / 100).toFixed(2) : amount))} /></label>
          <label>Category<select aria-label={`Line ${index + 1} category`} value={line.category} onChange={(event) => updateLine(index, { category: event.target.value as ExpenseCategory })}>
            {expenseCategories.map((category) => <option key={category}>{category}</option>)}
          </select></label>
          <label>Necessity<select aria-label={`Line ${index + 1} necessity`} value={line.necessity} onChange={(event) => updateLine(index, { necessity: event.target.value as ExpenseNecessity })}>
            <option value="essential">Essential</option><option value="discretionary">Discretionary</option><option value="neutral">Neutral</option>
          </select></label>
        </div>)}
      </div>
      {fieldErrors.lineItems && <p className="field-error" role="alert">{fieldErrors.lineItems}</p>}
      <div className="receipt-editor-actions">
        <button className="button secondary" onClick={() => {
          clearFieldError("lineItems");
          setLineItems((current) => [...current, {
            rawName: "", name: "", quantity: 1, amountCents: 0, category: "Groceries", necessity: "essential"
          }]);
          setLineAmountInputs((current) => [...current, ""]);
        }}>＋ Add line</button>
        <button className="button secondary" onClick={closeEditor}>Cancel</button>
        <button className="button primary" disabled={busy} onClick={() => void saveReceipt()}>{busy ? "Saving…" : editingReceiptId ? "Update receipt" : "Save receipt"}</button>
      </div>
    </div>}

    <div className="receipt-list-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Receipts</h2></div><span className="muted">{periodLabel} · {periodReceipts.length} total</span></div>
    {periodReceipts.length === 0 ? <div className="empty">
      <span className="empty-icon">€</span><h2>No expenses in this period</h2><p>Choose another period or add a receipt.</p>
    </div> : <div className="saved-receipt-list">
      {[...periodReceipts].sort((a, b) => b.receipt.purchaseDateKey.localeCompare(a.receipt.purchaseDateKey)).map(({ id, receipt }) => (
        <article className="saved-receipt" key={id}>
          <button className="saved-receipt-main" onClick={() => setExpandedReceipt(expandedReceipt === id ? null : id)}>
            <span className="saved-receipt-icon">▤</span>
            <span className="saved-receipt-detail"><strong>{receipt.storeName}</strong><small>{receipt.purchaseDateKey}{receipt.purchaseTime ? ` · ${receipt.purchaseTime}` : ""} · {receipt.lineItems.length} items</small></span>
            <strong className="saved-receipt-total">{formatCents(receipt.totalCents)}</strong>
            <span className="saved-receipt-chevron">{expandedReceipt === id ? "−" : "+"}</span>
          </button>
          {expandedReceipt === id && <div className="saved-receipt-lines">
            {receipt.lineItems.map((line, index) => <div className="saved-line" key={`${line.name}-${index}`}><span>{line.name} <small>×{line.quantity} · {line.category}</small></span><strong>{formatCents(line.amountCents)}</strong></div>)}
            <button className="action-button" onClick={() => startEditingReceipt(id, receipt)}><span aria-hidden="true">✎</span> Edit receipt</button>
            <button className="action-button destructive-action" onClick={() => void removeReceipt(id)}><span aria-hidden="true">⌫</span> Delete receipt</button>
          </div>}
        </article>
      ))}
    </div>}
  </section>
  {cameraOpen && <div className="receipt-camera-backdrop" role="dialog" aria-modal="true" aria-label="Align and capture receipt">
    <div className="receipt-camera">
      <div className="receipt-camera-heading">
        <div>
          <strong>Align your receipt</strong>
          <span>Fit the full bill inside the guide. Keep it flat and avoid glare.</span>
        </div>
        <button className="icon-button" aria-label="Close camera" onClick={closeCamera}>×</button>
      </div>
      <div className="receipt-camera-view">
        <video ref={cameraVideoRef} autoPlay muted playsInline />
        <div className="receipt-camera-guide" aria-hidden="true"><span /></div>
      </div>
      <div className="receipt-camera-actions">
        <button className="button secondary" onClick={closeCamera}>Cancel</button>
        <button className="button primary" disabled={!cameraStream} onClick={captureCameraImage}>Capture & scan</button>
      </div>
    </div>
  </div>}
  {scanning && <div className="receipt-scanning-overlay" role="status" aria-live="polite">
    <span className="receipt-scanning-spinner" aria-hidden="true" />
    <strong>Scanning receipt image…</strong>
    <span>Please wait while we read the receipt.</span>
  </div>}
  </>;
}
