import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import {
  createItem,
  completeShoppingList,
  deleteItem,
  expenseCategories,
  itemsForPurchaseCompletion,
  itemsForView,
  ensureSettings,
  KITCHEN_OWNER_EMAIL,
  setItemBought,
  updateItem,
  updateSettings,
  type ExpenseCategory,
  type ItemState,
  type KitchenItem,
  type NewKitchenItem
} from "@my-kitchen/shared";
import { getDatabase, getFirebaseAuth } from "./firebase";
import { useItems, useSettings } from "./hooks";
import BudgetsPage from "./BudgetsPage";
import InsightsPage from "./InsightsPage";
import ReceiptsPage from "./ReceiptsPage";
import { useToast } from "./toast";

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

function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError && error.code === "auth/unauthorized-domain") {
    return `Add "${window.location.hostname}" under Firebase Console → Authentication → Settings → Authorized domains, then retry.`;
  }
  return error instanceof Error ? error.message : String(error);
}

function SignInGate({
  error,
  loading,
  onSignIn
}: {
  error: string | null;
  loading: boolean;
  onSignIn: () => void;
}) {
  return <main className="auth-page">
    <section className="auth-card">
      <span className="brand-mark">m</span>
      <p className="eyebrow">YOUR PRIVATE KITCHEN</p>
      <h1>Sign in to My Kitchen</h1>
      <p className="muted">Use the authorized Google account to access your pantry and spending data.</p>
      {error && <p className="error" role="alert">{error}</p>}
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
  const [quantity, setQuantity] = useState(String(initial?.item.quantity ?? 1));
  const [category, setCategory] = useState<ExpenseCategory>(initial?.item.category ?? "Other");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const minimumQuantity = initial && initial.item.state !== "toBuy" ? 0 : defaultState === "toBuy" ? 1 : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!name.trim()) {
      const message = "Enter an item name.";
      setError(message);
      showToast(message, "error");
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < minimumQuantity || parsedQuantity > 9999) {
      const message = `Quantity must be a whole number between ${minimumQuantity} and 9999.`;
      setError(message);
      showToast(message, "error");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), quantity: parsedQuantity, category, state: defaultState });
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
          <input aria-label="Quantity" type="number" min={minimumQuantity} max="9999" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
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
  onDelete: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lastSwipeAt = useRef(0);
  const [deleting, setDeleting] = useState(false);

  function triggerDelete() {
    if (deleting) return;
    lastSwipeAt.current = Date.now();
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

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 65 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      triggerDelete();
    } else if (!shopping) {
      lastSwipeAt.current = Date.now();
      onRestock();
    } else {
      lastSwipeAt.current = Date.now();
    }
  }

  return (
    <article
      className={`item-card${!shopping && item.quantity === 1 ? " stock-critical" : ""}${!shopping && item.quantity !== 1 && item.quantity <= 3 ? " stock-low" : ""}${deleting ? " swipe-deleting" : ""}`}
      onClickCapture={(event) => {
        if (Date.now() - lastSwipeAt.current < 400) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerCancel={() => { pointerStart.current = null; }}
      onPointerDown={onPointerDown}
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
        <span className={`muted${shopping && item.bought ? " bought-item" : ""}`}>Qty {item.quantity} · {item.category}</span>
      </button>
      {item.state === "finished" && <span className="pill finished">Finished</span>}
      <div className="item-actions">
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

  const shown = useMemo(() => itemsForView(items.data ?? [], shopping ? "shopping" : "pantry", now).filter(({ item }) => {
    if (!shopping && category !== "All categories" && item.category !== category) return false;
    return shopping || item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }), [category, items.data, now, search, shopping]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function saveItem(item: NewKitchenItem) {
    if (editing) {
      await updateItem(getDatabase(), editing.id, {
        name: item.name,
        quantity: item.quantity,
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
    const shoppingItems = itemsForView(items.data ?? [], "shopping");
    const purchaseItems = itemsForPurchaseCompletion(shoppingItems);
    const target = shoppingItems.find(({ id: itemId }) => itemId === id);
    const allBought = purchaseItems.length > 0 && purchaseItems.every(({ id: itemId, item }) => (
      itemId === id ? bought : item.bought === true
    ));
    try {
      if (allBought) {
        await completeShoppingList(
          getDatabase(),
          purchaseItems.map(({ id: itemId }) => itemId),
          id
        );
        showToast("All shopping-list items purchased and moved to Pantry.");
      } else {
        await setItemBought(
          getDatabase(),
          id,
          bought,
          !bought && target?.item.state === "inStock" ? "toBuy" : undefined
        );
        if (!bought) showToast("Purchase unchecked.", "info");
      }
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    }
  }

  async function saveRestock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(restockQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      setRestockError("Enter a whole number between 1 and 9999.");
      return;
    }
    if (!restockTarget) return;
    try {
      await updateItem(getDatabase(), restockTarget.id, {
        quantity,
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

  async function removeAfterSwipe(id: string) {
    try {
      await deleteItem(getDatabase(), id);
      setError(null);
      showToast("Item deleted.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
      throw caught;
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
      {!shopping && <div className="filters">
        <label className="search-field">Search pantry<input aria-label="Search pantry" placeholder="Find an item…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Category<select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option>All categories</option>{expenseCategories.map((entry) => <option key={entry}>{entry}</option>)}
        </select></label>
      </div>}
      <p className="swipe-hint">
        {shopping ? "Swipe left to delete · check off items as you buy them" : "Swipe right to restock · swipe left to delete"}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {shown.length === 0 ? <div className="empty">
        <span className="empty-icon">{shopping ? "✓" : "⌂"}</span>
        <h2>{shopping ? "Your list is clear" : "Your pantry is empty"}</h2>
        <p>{shopping ? "Add an item or mark pantry items as finished to see them here." : "Add your first kitchen item to get started."}</p>
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
          onDelete={removeAfterSwipe}
          onError={setError}
        />
      ))}</div>}
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
                inputMode="numeric"
                min="1"
                max="9999"
                step="1"
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
      await updateSettings(getDatabase(), changes);
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
      <p className="muted">Receive an in-app and push alert when an active budget reaches 80% or 100%.</p>
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
    <div className="settings-card app-info"><h2>My Kitchen</h2><p className="muted">Personal kitchen and spending tracker · English interface · EUR</p></div>
  </section>;
}

function App() {
  const { showToast } = useToast();
  const location = useLocation();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    try {
      return onAuthStateChanged(getFirebaseAuth(), (user) => {
        setAuthUser(user);
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
    if (
      !authUser
      || authUser.email?.toLocaleLowerCase() !== KITCHEN_OWNER_EMAIL
      || !authUser.emailVerified
    ) {
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
  }, [authUser]);

  async function continueWithGoogle() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(getFirebaseAuth(), provider);
      if (
        credential.user.email?.toLocaleLowerCase() !== KITCHEN_OWNER_EMAIL
        || !credential.user.emailVerified
      ) {
        await signOut(getFirebaseAuth());
        throw new Error(`Use the authorized Google account (${KITCHEN_OWNER_EMAIL}).`);
      }
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

  if (authLoading) return <PageMessage>Checking sign-in…</PageMessage>;
  if (
    !authUser
    || authUser.email?.toLocaleLowerCase() !== KITCHEN_OWNER_EMAIL
    || !authUser.emailVerified
  ) {
    return <SignInGate
      error={authError ?? (authUser ? `Use the authorized Google account (${KITCHEN_OWNER_EMAIL}).` : null)}
      loading={authBusy}
      onSignIn={() => void continueWithGoogle()}
    />;
  }

  return <div className="app-shell min-h-screen bg-kitchen-50">
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">m</span><span>my kitchen</span></Link>
      <nav aria-label="Main navigation">{routes.map((route) => <Link className={location.pathname === route.path ? "active" : ""} key={route.path} to={route.path}>{route.label}</Link>)}</nav>
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
    <footer>Made for a calmer kitchen <span>·</span> Changes sync live through Firestore</footer>
  </div>;
}

export default App;
