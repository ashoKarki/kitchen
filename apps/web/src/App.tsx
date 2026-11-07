import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  createItem,
  adjustItemQuantity,
  deleteItem,
  expenseCategories,
  filterItemsByName,
  formatQuantity,
  itemsForView,
  recentlyDeletedItems,
  itemUndoMilliseconds,
  parseQuantity,
  ensureSettings,
  setItemBought,
  stockWarning,
  updateItem,
  undoDeleteItem,
  updateSettings,
  getKitchenDocPath,
  setActiveKitchenId,
  bootstrapPersonalHousehold,
  householdBootstrapErrorMessage,
  type ExpenseCategory,
  type ItemState,
  type KitchenItem,
  type NewKitchenItem
} from "@my-kitchen/shared";
import { getCloudFunctions, getDatabase, getFirebaseAuth } from "./firebase";
import { useItems, useSettings } from "./hooks";
import BudgetsPage from "./BudgetsPage";
import InsightsPage from "./InsightsPage";
import NotificationsPage from "./NotificationsPage";
import { useBudgetAlerts } from "./useBudgetData";
import ReceiptsPage from "./ReceiptsPage";
import { useToast } from "./toast";
import { useKitchenId } from "./useKitchenPath";
import { inventorySwipeDirection, inventorySwipeOffset } from "./inventorySwipe";
import "./style.css";

const routes = [
  { path: "/", label: "Pantry" },
  { path: "/shopping", label: "Shopping List" },
  { path: "/expenses", label: "Expenses" },
  { path: "/budgets", label: "Budgets" },
  { path: "/insights", label: "Insights" },
  { path: "/settings", label: "Settings" }
];

function PageMessage({ children }: { children: string }) {
  return <p className="message" role="status">{children}</p>;
}

function NotificationsLink() {
  const { data, error } = useBudgetAlerts();
  const unread = data?.filter(({ alert }) => !alert.read).length ?? 0;
  return <Link to="/notifications" className="notifications-link" aria-label={error ? "Notifications, unable to load" : `Notifications${unread ? `, ${unread} unread` : ""}`} title={error ? `Could not load notifications: ${error}` : "Notifications"}>
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {unread > 0 && <span className="notifications-badge">{unread > 99 ? "99+" : unread}</span>}
  </Link>;
}

function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError && error.code === "auth/unauthorized-domain") {
    return `Add "${window.location.hostname}" under Firebase Console → Authentication → Settings → Authorized domains, then retry.`;
  }
  return error instanceof Error ? error.message : String(error);
}

function SignInGate({
  error,
  loading,
  onSignIn,
  privateAccess,
  onJoin,
  onSignOut
}: {
  error: string | null;
  loading: boolean;
  onSignIn: () => void;
  privateAccess: boolean;
  onJoin: (code: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState("");
  return <main className="auth-page">
    <section className="auth-card">
      <span className="brand-mark">m</span>
      <p className="eyebrow">YOUR PRIVATE KITCHEN</p>
      <h1>Sign in to My Kitchen</h1>
      <p className="muted">Sign in with Google to access your pantry and spending data.</p>
      {privateAccess && <p className="error" role="status">Set up your household, or join an existing one with an invitation code.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {privateAccess && <form onSubmit={(event) => {
        event.preventDefault();
        void onJoin(code.trim());
      }}>
        <label htmlFor="invite-code">Invitation code</label>
        <input id="invite-code" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
        <button className="button primary" disabled={loading || !code.trim()}>Join kitchen</button>
      </form>}
      {privateAccess && <button className="button secondary" onClick={onSignOut}>Sign out</button>}
      <button className="button primary" disabled={loading} onClick={onSignIn}>
        {loading ? "Signing in…" : "Continue with Google"}
      </button>
    </section>
  </main>;
}

function ItemEditor({
  initial,
  defaultState,
  onSave,
  onCancel
}: {
  initial: { id: string; item: KitchenItem } | undefined;
  defaultState: ItemState;
  onSave: (item: NewKitchenItem) => Promise<void>;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(initial?.item.name ?? "");
  const [quantity, setQuantity] = useState(formatQuantity(initial?.item.quantity ?? 1));
  const [category, setCategory] = useState<ExpenseCategory>(initial?.item.category ?? "Other");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const allowsZero = initial ? initial.item.state !== "toBuy" : defaultState !== "toBuy";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = parseQuantity(quantity);
    if (!name.trim()) {
      const message = "Enter an item name.";
      setError(message);
      showToast(message, "error");
      return;
    }
    if (parsedQuantity === null || (!allowsZero && parsedQuantity === 0)) {
      const message = `Quantity must be ${allowsZero ? "at least" : "greater than"} 0 and at most 9999, with up to 9 decimal places.`;
      setError(message);
      showToast(message, "error");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), quantity: parsedQuantity, category, state: defaultState === "inStock" && parsedQuantity === 0 ? "finished" : defaultState });
      onCancel();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="item-form" onSubmit={(event) => void submit(event)}>
      <label>
        Item name
        <input aria-label="Item name" autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="form-grid">
        <label>
          Quantity
          <input aria-label="Quantity" type="number" min="0" max="9999" step="any" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label>
          Category
          <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>
            {expenseCategories.map((entry) => <option key={entry}>{entry}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save item"}</button>
      </div>
    </form>
  );
}

function InventoryItemCard({
  id,
  item,
  shopping,
  onEdit,
  onFinish,
  onBought,
  onRestock,
  onAdjust,
  onDelete,
  onError
}: {
  id: string;
  item: KitchenItem;
  shopping: boolean;
  onEdit: () => void;
  onFinish: () => void;
  onBought: (bought: boolean) => void;
  onRestock: () => void;
  onAdjust: (direction: "add" | "subtract") => void;
  onDelete: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lastSwipeAt = useRef(0);
  const [deleting, setDeleting] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const warning = shopping ? null : stockWarning(item);

  function triggerDelete() {
    if (deleting) return;
    lastSwipeAt.current = Date.now();
    if (!window.confirm(`Delete ${item.name}? You can undo this for one minute.`)) return;
    setDeleting(true);
    window.setTimeout(() => {
      void onDelete(id).catch((caught: unknown) => {
        setDeleting(false);
        onError(caught instanceof Error ? caught.message : String(caught));
      });
    }, 220);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 12 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    lastSwipeAt.current = Date.now();
    setSwipeOffset(inventorySwipeOffset(deltaX));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    setSwipeOffset(0);
    if (!start) return;

    const direction = inventorySwipeDirection(event.clientX - start.x, event.clientY - start.y);
    if (!direction) return;
    lastSwipeAt.current = Date.now();
    if (direction === "left") {
      triggerDelete();
    } else if (shopping) {
      onBought(item.bought !== true);
    } else {
      onRestock();
    }
  }

  return (
    <article
      className={`item-card${shopping ? "" : " pantry-card"}${warning === "critical" ? " stock-critical" : ""}${warning === "low" ? " stock-low" : ""}${deleting ? " swipe-deleting" : ""}`}
      style={swipeOffset && !deleting ? { transform: `translateX(${swipeOffset}px)` } : undefined}
      onClickCapture={(event) => {
        if (Date.now() - lastSwipeAt.current < 400) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerCancel={() => { pointerStart.current = null; setSwipeOffset(0); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {shopping && <button
        aria-checked={item.bought === true}
        aria-label={`Mark ${item.name} as bought`}
        className={`check${item.bought ? " checked" : ""}`}
        onClick={() => onBought(item.bought !== true)}
        role="checkbox"
        type="button"
      >{item.bought ? "×" : ""}</button>}
      <button className="item-main" onClick={onEdit}>
        <span className={`item-name${shopping && item.bought ? " bought-item" : ""}`}>{item.name}</span>
        <span className={`muted${shopping && item.bought ? " bought-item" : ""}`}>Qty {formatQuantity(item.quantity)} · {item.category}{warning ? ` · ${warning === "critical" ? "Critical stock" : "Low stock"}` : ""}</span>
      </button>
      {item.state === "finished" && <span className="pill finished">Finished</span>}
      <div className="item-actions">
        {!shopping && <button className="button small secondary" aria-label={`Subtract from ${item.name}`} onClick={() => onAdjust("subtract")}>−</button>}
        {!shopping && <button className="button small secondary" aria-label={`Add to ${item.name}`} onClick={() => onAdjust("add")}>＋</button>}
        {!shopping && item.state === "inStock" && <button className="button small secondary" onClick={onFinish}>Finished</button>}
        {!shopping && item.state === "finished" && <button className="button small secondary" onClick={onRestock}>Restock</button>}
        <button className="icon-button" aria-label={`Delete ${item.name}`} onClick={triggerDelete}>⌫</button>
      </div>
    </article>
  );
}

function InventoryPage({ shopping }: { shopping: boolean }) {
  const { showToast } = useToast();
  const items = useItems();
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [editing, setEditing] = useState<{ id: string; item: KitchenItem } | null>(null);
  const [adding, setAdding] = useState(false);
  const [restockTarget, setRestockTarget] = useState<{ id: string; item: KitchenItem } | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockError, setRestockError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; item: KitchenItem; direction: "add" | "subtract" } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const pendingPurchases = useRef(new Set<string>());

  const shown = useMemo(() => filterItemsByName(itemsForView(items.data ?? [], shopping ? "shopping" : "pantry", now), search).filter(({ item }) => {
    if (!shopping && category !== "All categories" && item.category !== category) return false;
    return true;
  }), [category, items.data, now, search, shopping]);
  const deleted = recentlyDeletedItems(items.data ?? [], now.getTime());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function saveItem(item: NewKitchenItem) {
    if (editing) {
      await updateItem(getDatabase(), editing.id, {
        name: item.name,
        quantity: item.quantity,
        ...(editing.item.state !== "toBuy" ? {
          stockBaseline: item.quantity > editing.item.quantity ? item.quantity : (editing.item.stockBaseline ?? editing.item.quantity),
          ...(item.quantity !== editing.item.quantity ? { state: item.quantity === 0 ? "finished" : "inStock" } : {})
        } : {}),
        category: item.category,
        bought: false,
        boughtAt: null,
        receiptRecorded: false
      });
    } else {
      await createItem(getDatabase(), item);
    }
    showToast(editing ? `${item.name} updated.` : `${item.name} added to ${shopping ? "Shopping List" : "Pantry"}.`);
  }

  async function transition(id: string, state: ItemState) {
    try {
      await updateItem(getDatabase(), id, {
        state,
        ...(state === "inStock" ? {} : { bought: false, boughtAt: null, receiptRecorded: false })
      });
      setError(null);
      showToast(state === "finished" ? "Item marked finished." : "Item restocked.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  async function markBought(id: string, bought: boolean) {
    if (pendingPurchases.current.has(id)) return;
    pendingPurchases.current.add(id);
    try {
      await setItemBought(getDatabase(), id, bought);
      showToast(bought ? "Item moved to Pantry." : "Purchase unchecked.", "info");
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      pendingPurchases.current.delete(id);
    }
  }

  async function saveRestock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = parseQuantity(restockQuantity);
    if (quantity === null || quantity === 0) {
      setRestockError("Enter an amount above 0 and up to 9999, with at most 9 decimal places.");
      return;
    }
    if (!restockTarget) return;
    try {
      await updateItem(getDatabase(), restockTarget.id, {
        quantity,
        stockBaseline: quantity,
        state: "inStock",
        bought: false,
        boughtAt: null,
        receiptRecorded: false
      });
      setRestockTarget(null);
      setRestockQuantity("");
      setRestockError(null);
      setError(null);
      showToast("Item restocked.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setRestockError(message);
      showToast(message, "error");
    }
  }

  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustTarget || adjustBusy) return;
    const amount = parseQuantity(adjustAmount);
    if (amount === null || amount === 0) {
      setAdjustError("Enter an amount above 0 and up to 9999, with at most 9 decimal places.");
      return;
    }
    setAdjustBusy(true);
    setAdjustError(null);
    try {
      await adjustItemQuantity(getDatabase(), adjustTarget.id, adjustTarget.direction === "add" ? amount : -amount);
      setAdjustTarget(null);
      showToast("Quantity updated.");
    } catch (caught) {
      setAdjustError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAdjustBusy(false);
    }
  }

  async function removeAfterSwipe(id: string) {
    try {
      await deleteItem(getDatabase(), id);
      setError(null);
      showToast("Item deleted. You can undo for one minute.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
      throw caught;
    }
  }

  async function undoDelete(id: string) {
    try {
      await undoDeleteItem(getDatabase(), id);
      setError(null);
      showToast("Item restored.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  if (items.loading) return <PageMessage>Loading items…</PageMessage>;
  if (items.error) return <p className="error" role="alert">Could not load items: {items.error}</p>;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{shopping ? "YOUR NEXT SHOP" : "IN YOUR KITCHEN"}</p>
          <h1>{shopping ? "Shopping List" : "Pantry"}</h1>
          <p className="muted">{shopping ? "Items to pick up and things that have run out." : "Keep track of what is in stock and what needs restocking."}</p>
        </div>
        <button className="button primary" onClick={() => { setEditing(null); setAdding(true); }}>＋ Add item</button>
      </div>
      <div className="filters">
        <label className="search-field">Search {shopping ? "shopping list" : "pantry"}<input aria-label={shopping ? "Search shopping list" : "Search pantry"} placeholder="Find an item…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {!shopping && <label>Category<select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option>All categories</option>{expenseCategories.map((entry) => <option key={entry}>{entry}</option>)}
        </select></label>}
      </div>
      <p className="swipe-hint">
        {shopping ? "Swipe right to mark or reset purchase · swipe left to delete" : "Swipe right to restock · swipe left to delete"}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {deleted.length > 0 && <div className="deleted-items" aria-label="Recently deleted items">
        {deleted.map(({ id, item }) => <div className="deleted-item" key={id}>
          <span>{item.name} deleted · {Math.max(0, Math.ceil(((item.deletedAt?.toMillis() ?? 0) + itemUndoMilliseconds - now.getTime()) / 1000))}s to undo</span>
          <button className="button small secondary" onClick={() => void undoDelete(id)}>Undo</button>
        </div>)}
      </div>}
      {shown.length === 0 ? <div className="empty">
        <span className="empty-icon">{shopping ? "✓" : "⌂"}</span>
        <h2>{search.trim() || (!shopping && category !== "All categories") ? "No matching items" : shopping ? "Your list is clear" : "Your pantry is empty"}</h2>
        <p>{search.trim() || (!shopping && category !== "All categories") ? "Try a different search or filter." : shopping ? "Add an item or mark pantry items as finished to see them here." : "Add your first kitchen item to get started."}</p>
      </div> : <div className="item-list">{shown.map(({ id, item }) => (
        <InventoryItemCard
          key={id}
          id={id}
          item={item}
          shopping={shopping}
          onEdit={() => { setEditing({ id, item }); setAdding(false); }}
          onFinish={() => void transition(id, "finished")}
          onBought={(bought) => void markBought(id, bought)}
          onRestock={() => {
            setRestockTarget({ id, item });
            setRestockQuantity("");
            setRestockError(null);
          }}
          onAdjust={(direction) => {
            setAdjustTarget({ id, item, direction });
            setAdjustAmount("");
            setAdjustError(null);
          }}
          onDelete={removeAfterSwipe}
          onError={setError}
        />
      ))}</div>}
      {adjustTarget && <div className="dialog-backdrop">
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="adjust-dialog-title">
          <h2 id="adjust-dialog-title">{adjustTarget.direction === "add" ? "Add to" : "Subtract from"} {adjustTarget.item.name}</h2>
          <p className="muted">Current quantity: {formatQuantity(adjustTarget.item.quantity)}</p>
          <form className="item-form" onSubmit={(event) => void saveAdjustment(event)}>
            <label>Amount<input aria-label="Adjustment amount" type="number" min="0" max="9999" step="any" inputMode="decimal" autoFocus value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} /></label>
            {adjustError && <p className="error" role="alert">{adjustError}</p>}
            <div className="actions">
              <button type="button" className="button secondary" disabled={adjustBusy} onClick={() => setAdjustTarget(null)}>Cancel</button>
              <button className="button primary" disabled={adjustBusy}>Update quantity</button>
            </div>
          </form>
        </section>
      </div>}
      {(adding || editing) && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setAdding(false); setEditing(null); } }}>
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
          <p className="eyebrow">KITCHEN INVENTORY</p>
          <h2 id="item-dialog-title">{editing ? "Edit item" : "Add an item"}</h2>
          <ItemEditor
            initial={editing ?? undefined}
            defaultState={shopping ? "toBuy" : "inStock"}
            onSave={saveItem}
            onCancel={() => { setAdding(false); setEditing(null); }}
          />
        </section>
      </div>}
      {restockTarget && <div
        className="dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRestockTarget(null);
        }}
      >
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="restock-dialog-title">
          <p className="eyebrow">UPDATE PANTRY</p>
          <h2 id="restock-dialog-title">Restock {restockTarget.item.name}</h2>
          <form className="item-form" onSubmit={(event) => void saveRestock(event)}>
            <label>
              New stock quantity
              <input
                aria-label="New stock quantity"
                autoFocus
                inputMode="decimal"
                min="0"
                max="9999"
                step="any"
                type="number"
                value={restockQuantity}
                onChange={(event) => setRestockQuantity(event.target.value)}
              />
            </label>
            {restockError && <p className="error" role="alert">{restockError}</p>}
            <div className="actions">
              <button className="button secondary" type="button" onClick={() => setRestockTarget(null)}>Cancel</button>
              <button className="button primary" type="submit">Save stock</button>
            </div>
          </form>
        </section>
      </div>}
    </section>
  );
}

function SettingsPage() {
  const { showToast } = useToast();
  const settings = useSettings();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(changes: Parameters<typeof updateSettings>[1]) {
    setSaved(false);
    setError(null);
    try {
      await updateSettings(getDatabase(), changes, getFirebaseAuth().currentUser?.uid);
      setSaved(true);
      showToast("Settings saved.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  if (settings.loading) return <PageMessage>Loading settings…</PageMessage>;
  if (settings.error || !settings.data) return <p className="error" role="alert">Could not load settings: {settings.error ?? "Settings unavailable."}</p>;
  const current = settings.data;

  return <section className="page narrow">
    <p className="eyebrow">MAKE IT YOURS</p>
    <h1>Settings</h1>
    <p className="muted">Choose when your kitchen should nudge you and how spending is categorized.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {saved && <p className="success" role="status">Settings saved.</p>}
    <div className="settings-card">
      <h2>Finished item reminder</h2>
      <p className="muted">A daily reminder when something is marked finished.</p>
      <label className="toggle-row">
        <span>Enable daily reminder</span>
        <input type="checkbox" checked={current.reminderEnabled} onChange={(event) => void save({ reminderEnabled: event.target.checked })} />
      </label>
      <label className="setting-row">Reminder hour
        <select aria-label="Reminder hour" value={current.reminderHour} onChange={(event) => void save({ reminderHour: Number(event.target.value) })}>
          {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
        </select>
      </label>
      <p className="hint">Timezone: {current.timeZone}</p>
    </div>
    <div className="settings-card">
      <h2>Budget alerts</h2>
      <p className="muted">Receive an in-app and push alert as an active budget reaches its warning thresholds and goes over budget.</p>
      <label className="toggle-row"><span>Enable budget alerts</span>
        <input type="checkbox" checked={current.budgetAlertsEnabled} onChange={(event) => void save({ budgetAlertsEnabled: event.target.checked })} />
      </label>
    </div>
    <div className="settings-card">
      <h2>Discretionary categories</h2>
      <p className="muted">These categories count toward discretionary spending.</p>
      {expenseCategories.map((entry) => <label className="toggle-row" key={entry}>
        <span>{entry}</span>
        <input type="checkbox" checked={current.discretionaryCategories.includes(entry)} onChange={(event) => {
          const updated = event.target.checked
            ? [...current.discretionaryCategories, entry]
            : current.discretionaryCategories.filter((categoryName) => categoryName !== entry);
          void save({ discretionaryCategories: updated });
        }} />
      </label>)}
    </div>
    <HouseholdSettings />
    <AccountSettings />
    <div className="settings-card app-info"><h2>My Kitchen</h2><p className="muted">Personal kitchen and spending tracker · English interface · EUR</p></div>
  </section>;
}

function AccountSettings() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (!window.confirm("Delete your My Kitchen account? You will lose access to this household. Shared household records will remain for other members.")) {
      return;
    }
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

  return <section className="settings-card">
    <h2>Account</h2>
    <p className="muted">Deleting your account removes your household membership, personal settings and registered devices. Shared household records are not deleted.</p>
    <p className="hint">Owners must transfer ownership before deleting their account. Deleting your account does not delete the household.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button secondary" disabled={busy} onClick={() => void deleteAccount()}>
      {busy ? "Deleting…" : "Delete my account"}
    </button>
  </section>;
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

  async function createHouseholdInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  async function joinHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  if (members === null && !error) return <div className="settings-card"><p className="muted">Loading household members…</p></div>;

  return <section className="settings-card">
    <h2>Join a household</h2>
    <p className="muted">Enter an invitation code to switch from your personal household. Your personal data is retained.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <form className="item-form" onSubmit={(event) => void joinHousehold(event)}>
      <label>Invitation code
        <input autoComplete="one-time-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
      </label>
      <button className="button primary" disabled={busy || !joinCode.trim()}>Join household</button>
    </form>
    {members?.some((member) => member.role === "owner") && <>
      <h2>Your household</h2>
      <p className="muted">Invite a partner with a single-use code that expires after 48 hours.</p>
      <form className="item-form" onSubmit={(event) => void createHouseholdInvite(event)}>
        <label>Email lock (optional)
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="button primary" disabled={busy}>Create invitation</button>
      </form>
      {inviteCode && <p className="success" role="status">Share this code with your partner; it is shown once: <strong>{inviteCode}</strong></p>}
    </>}
    {members?.filter((member) => member.role !== "owner").map((member) => <div className="settings-row" key={member.uid}>
      <span>{member.displayName || "Kitchen member"}</span>
      <div className="actions">
        <button className="button secondary" disabled={busy} onClick={() => {
          if (window.confirm(`Transfer kitchen ownership to ${member.displayName || "this member"}?`)) {
            void manageMember(member.uid, "transferOwnership");
          }
        }}>Transfer ownership</button>
        <button className="button secondary" disabled={busy} onClick={() => {
          if (window.confirm(`Remove ${member.displayName || "this member"} from the household?`)) {
            void manageMember(member.uid, "removeHouseholdMember");
          }
        }}>Remove</button>
      </div>
    </div>)}
  </section>;
}

function App() {
  const { showToast } = useToast();
  const activeKitchenId = useKitchenId();
  const location = useLocation();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<"checking" | "member" | "private" | "signedOut">("checking");

  useEffect(() => {
    try {
      return onAuthStateChanged(getFirebaseAuth(), (user) => {
        setAuthUser(user);
        setMembershipStatus(user ? "checking" : "signedOut");
        setActiveKitchenId(null);
        setAuthLoading(false);
        setAuthError(null);
      }, (error) => {
        setAuthError(error.message);
        setAuthLoading(false);
      });
    } catch (error) {
      setAuthError(authErrorMessage(error));
      setAuthLoading(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!authUser) {
      setSetupError(null);
      return;
    }
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

  useEffect(() => {
    if (!authUser || membershipStatus !== "member" || !activeKitchenId) {
      setSetupError(null);
      return;
    }
    let active = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void Promise.resolve().then(() => ensureSettings(getDatabase(), timeZone)).then(() => {
      if (active) setSetupError(null);
    }).catch((error: unknown) => {
      if (active) setSetupError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [authUser, membershipStatus, activeKitchenId]);

  async function continueWithGoogle() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
      showToast("Signed in successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthError(message);
      showToast(message, "error");
    } finally {
      setAuthBusy(false);
    }
  }

  async function leaveKitchen() {
    try {
      await signOut(getFirebaseAuth());
      showToast("Signed out.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthError(message);
      showToast(message, "error");
    }
  }

  async function joinKitchen(code: string) {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const join = httpsCallable<{ code: string }, { status: "member"; householdId: string }>(getCloudFunctions(), "joinHousehold");
      const { data } = await join({ code });
      setActiveKitchenId(data.householdId);
      setMembershipStatus("member");
      setAuthError(null);
      showToast("Joined the kitchen.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthError(message);
      showToast(message, "error");
    } finally {
      setAuthBusy(false);
    }
  }

  if (authLoading || (authUser && membershipStatus === "checking")) return <PageMessage>Checking sign-in…</PageMessage>;
  if (!authUser || membershipStatus !== "member") {
    return <SignInGate
      error={authError}
      loading={authBusy}
      onSignIn={() => void continueWithGoogle()}
      privateAccess={Boolean(authUser)}
      onJoin={joinKitchen}
      onSignOut={() => void leaveKitchen()}
    />;
  }

  return <div className="app-shell min-h-screen bg-kitchen-50">
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">m</span><span>my kitchen</span></Link>
      <nav aria-label="Main navigation">{routes.map((route) => <Link className={location.pathname === route.path ? "active" : ""} key={route.path} to={route.path}>{route.label}</Link>)}</nav>
      <NotificationsLink />
      <span className="account-email">{authUser.email}</span>
      <button className="button small secondary" onClick={() => void leaveKitchen()}>Sign out</button>
      <span className="online-mark"><i /> Live sync</span>
    </header>
    {setupError && <p className="error global-error" role="alert">Could not initialize kitchen settings: {setupError}</p>}
    <main>
      <Routes>
        <Route path="/" element={<InventoryPage shopping={false} />} />
        <Route path="/shopping" element={<InventoryPage shopping />} />
        <Route path="/expenses" element={<ReceiptsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
    <footer>Made for a calmer kitchen <span>·</span> Changes sync live through Firestore <span>·</span> <a href="https://shoppingcart.at/privacy">Privacy</a> <span>·</span> <a href="https://shoppingcart.at/terms">Terms</a></footer>
  </div>;
}

export default App;
