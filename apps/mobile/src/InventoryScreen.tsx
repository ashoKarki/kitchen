import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import RNPickerSelect from "react-native-picker-select";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NotificationsButton from "./NotificationsButton";
import { pickerSelectStyle } from "./pickerStyles";
import { useToast } from "./toast";
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
  setItemBought,
  stockWarning,
  updateItem,
  undoDeleteItem,
  type ExpenseCategory,
  type ItemState,
  type KitchenItem,
  type NewKitchenItem
} from "@my-kitchen/shared";
import { getDatabase } from "./firebase";
import { useItems } from "./useItems";

function ItemForm({
  existing,
  state,
  onClose
}: {
  existing: { id: string; item: KitchenItem } | null;
  state: ItemState;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(existing?.item.name ?? "");
  const [quantity, setQuantity] = useState(formatQuantity(existing?.item.quantity ?? 1));
  const [category, setCategory] = useState<ExpenseCategory>(existing?.item.category ?? "Other");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const allowsZero = existing ? existing.item.state !== "toBuy" : state !== "toBuy";

  async function save() {
    const parsedQuantity = parseQuantity(quantity);
    if (!name.trim()) {
      setError("Enter an item name.");
      return;
    }
    if (parsedQuantity === null || (!allowsZero && parsedQuantity === 0)) {
      setError(`Quantity must be ${allowsZero ? "at least" : "greater than"} 0 and at most 9999, with up to 9 decimal places.`);
      return;
    }

    setSaving(true);
    setError(null);
    const newItem: NewKitchenItem = {
      name: name.trim(),
      quantity: parsedQuantity,
      category,
      state: state === "inStock" && parsedQuantity === 0 ? "finished" : state
    };
    try {
      if (existing) {
        await updateItem(getDatabase(), existing.id, {
          name: newItem.name,
          quantity: newItem.quantity,
          ...(existing.item.state !== "toBuy" ? {
            stockBaseline: newItem.quantity > existing.item.quantity ? newItem.quantity : (existing.item.stockBaseline ?? existing.item.quantity),
            ...(newItem.quantity !== existing.item.quantity ? { state: newItem.quantity === 0 ? "finished" : "inStock" } : {})
          } : {}),
          category: newItem.category,
          bought: false,
          boughtAt: null,
          receiptRecorded: false
        });
      } else {
        await createItem(getDatabase(), newItem);
      }
      showToast(existing ? `${newItem.name} updated.` : `${newItem.name} added to ${state === "toBuy" ? "Shopping List" : "Pantry"}.`);
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        accessibilityLabel="Item name"
        autoFocus
        maxLength={100}
        onChangeText={setName}
        placeholder="e.g. Oat milk"
        style={styles.input}
        value={name}
      />
      <Text style={styles.label}>Quantity</Text>
      <TextInput
        accessibilityLabel="Quantity"
        keyboardType="decimal-pad"
        onChangeText={setQuantity}
        style={styles.input}
        value={quantity}
      />
      <Text style={styles.label}>Category</Text>
      <RNPickerSelect
        onValueChange={(value: string | null) => {
          if (expenseCategories.includes(value as ExpenseCategory)) setCategory(value as ExpenseCategory);
        }}
        items={expenseCategories.map((entry) => ({ label: entry, value: entry }))}
        style={pickerSelectStyle}
        textInputProps={{ accessibilityLabel: "Category" }}
        value={category}
        useNativeAndroidPickerStyle={false}
        Icon={() => <Text style={styles.pickerChevron}>⌄</Text>}
      />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.formActions}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.primaryButton}>
          <Text style={styles.primaryText}>{saving ? "Saving…" : "Save item"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function InventoryItemRow({
  item,
  shopping,
  onEdit,
  onFinish,
  onBought,
  onRestock,
  onAdjust,
  onDelete
}: {
  item: KitchenItem;
  shopping: boolean;
  onEdit: () => void;
  onFinish: () => void;
  onBought: (bought: boolean) => void;
  onRestock: () => void;
  onAdjust: (direction: "add" | "subtract") => void;
  onDelete: () => Promise<void>;
}) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const [deleting, setDeleting] = useState(false);
  const warning = shopping ? null : stockWarning(item);

  function triggerDelete() {
    if (deleting) return;
    swipeRef.current?.close();
    Alert.alert("Delete item?", `Delete ${item.name}? You can undo this for one minute.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        setDeleting(true);
        void onDelete().catch(() => setDeleting(false));
      } }
    ]);
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      enabled={!deleting}
      friction={2.5}
      dragOffsetFromLeft={15}
      dragOffsetFromRight={-15}
      leftThreshold={40}
      onSwipeableOpen={(direction) => {
        if (direction === SwipeDirection.LEFT) {
          triggerDelete();
        } else {
          swipeRef.current?.close();
          if (shopping) onBought(item.bought !== true);
          else onRestock();
        }
      }}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(_progress, _translation, methods) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shopping ? `${item.bought ? "Reset purchase of" : "Mark as purchased"} ${item.name}` : `Restock ${item.name}`}
            onPress={() => {
              methods.close();
              if (shopping) onBought(item.bought !== true);
              else onRestock();
            }}
            style={[styles.swipeAction, styles.restockAction]}
          >
            <Text style={styles.swipeActionText}>{shopping ? item.bought ? "Reset" : "Purchased" : "Restock"}</Text>
          </Pressable>
        )}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          onPress={triggerDelete}
          style={[styles.swipeAction, styles.deleteAction]}
        >
          <Text style={styles.swipeActionText}>Delete</Text>
        </Pressable>
      )}
      rightThreshold={40}
      containerStyle={styles.swipeContainer}
    >
      <View
        accessibilityHint={shopping
          ? "Swipe right to mark or reset purchase, or left to delete."
          : "Swipe right to reveal restock or left to reveal delete."}
        style={[
          styles.itemCard,
          warning === "critical" && styles.stockCriticalCard,
          warning === "low" && styles.stockLowCard
        ]}
      >
        {shopping && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`Mark ${item.name} as bought`}
            accessibilityState={{ checked: item.bought === true }}
            onPress={() => onBought(item.bought !== true)}
            style={styles.check}
          >
            <Text style={styles.checkText}>{item.bought ? "☒" : "□"}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onEdit} style={[styles.itemText, !shopping && styles.pantryItemText]}>
          <Text style={[
            styles.itemName,
            shopping && item.bought && styles.boughtItemName,
            warning && styles.stockCardText
          ]}>{item.name}</Text>
          <Text style={[
            styles.itemDetail,
            shopping && item.bought && styles.boughtItemName,
            warning && styles.stockCardText
          ]}>
            Qty {formatQuantity(item.quantity)} · {item.category}{warning ? ` · ${warning === "critical" ? "Critical stock" : "Low stock"}` : ""}
          </Text>
        </Pressable>
        {item.state === "finished" && (
          <Text style={[styles.finished, warning && styles.stockCardFinished]}>
            Finished
          </Text>
        )}
        {!shopping && <Pressable accessibilityRole="button" accessibilityLabel={`Subtract from ${item.name}`} onPress={() => onAdjust("subtract")} style={[styles.smallButton, warning && styles.stockCardButton]}>
          <Text style={[styles.smallButtonText, warning && styles.stockCardText]}>−</Text>
        </Pressable>}
        {!shopping && <Pressable accessibilityRole="button" accessibilityLabel={`Add to ${item.name}`} onPress={() => onAdjust("add")} style={[styles.smallButton, warning && styles.stockCardButton]}>
          <Text style={[styles.smallButtonText, warning && styles.stockCardText]}>＋</Text>
        </Pressable>}
        {!shopping && item.state === "inStock" && (
          <Pressable
            accessibilityRole="button"
            onPress={onFinish}
            style={[styles.smallButton, warning && styles.stockCardButton]}
          >
            <Text style={[styles.smallButtonText, warning && styles.stockCardText]}>Mark finished</Text>
          </Pressable>
        )}
      </View>
    </ReanimatedSwipeable>
  );
}

export default function InventoryScreen({ shopping = false }: { shopping?: boolean }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { data: items, error, loading } = useItems();
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<{ id: string; item: KitchenItem } | null>(null);
  const [adding, setAdding] = useState(false);
  const [restockTarget, setRestockTarget] = useState<{ id: string; item: KitchenItem } | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockError, setRestockError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; item: KitchenItem; direction: "add" | "subtract" } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const pendingPurchases = useRef(new Set<string>());
  const visible = filterItemsByName(itemsForView(items ?? [], shopping ? "shopping" : "pantry", now), search);
  const deleted = recentlyDeletedItems(items ?? [], now.getTime());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  async function changeState(id: string, state: ItemState) {
    try {
      await updateItem(getDatabase(), id, {
        state,
        ...(state === "inStock" ? {} : { bought: false, boughtAt: null, receiptRecorded: false })
      });
      setActionError(null);
      showToast(state === "finished" ? "Item marked finished." : "Item restocked.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setActionError(message);
      showToast(message, "error");
    }
  }

  async function removeItem(id: string) {
    try {
      await deleteItem(getDatabase(), id);
      setActionError(null);
      showToast("Item deleted. You can undo for one minute.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setActionError(message);
      showToast(message, "error");
      throw caught;
    }
  }

  async function markBought(id: string, bought: boolean) {
    if (pendingPurchases.current.has(id)) return;
    pendingPurchases.current.add(id);
    try {
      await setItemBought(getDatabase(), id, bought);
      showToast(bought ? "Item moved to Pantry." : "Purchase unchecked.", "info");
      setActionError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setActionError(message);
      showToast(message, "error");
    } finally {
      pendingPurchases.current.delete(id);
    }
  }

  async function undoDelete(id: string) {
    try {
      await undoDeleteItem(getDatabase(), id);
      setActionError(null);
      showToast("Item restored.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setActionError(message);
      showToast(message, "error");
    }
  }

  async function saveRestock() {
    const quantity = parseQuantity(restockQuantity);
    if (quantity === null || quantity === 0) {
      setRestockError("Enter an amount above 0 and up to 9999, with at most 9 decimal places.");
      showToast("Enter an amount above 0 and up to 9999, with at most 9 decimal places.", "error");
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
      setActionError(null);
      showToast("Item restocked.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setRestockError(message);
      showToast(message, "error");
    }
  }

  async function saveAdjustment() {
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

  return (
    <View style={[styles.page, !shopping && { paddingTop: insets.top + 18 }]}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>{shopping ? "YOUR NEXT SHOP" : "IN YOUR KITCHEN"}</Text>
          <Text style={styles.title}>{shopping ? "Shopping List" : "Pantry"}</Text>
        </View>
        <View style={styles.headingActions}>
          {!shopping && <NotificationsButton />}
          <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setAdding(true); }} style={styles.primaryButton}>
            <Text style={styles.primaryText}>＋ Add</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.swipeHint}>
        {shopping ? "Swipe right to mark or reset purchase · left to delete" : "Swipe right to restock · left to delete"}
      </Text>
      <TextInput
        accessibilityLabel={shopping ? "Search shopping list" : "Search pantry"}
        placeholder={shopping ? "Search shopping list…" : "Search pantry…"}
        value={search}
        onChangeText={setSearch}
        style={styles.searchInput}
        autoCorrect={false}
      />
      {loading && <Text style={styles.message}>Loading items…</Text>}
      {error && !loading && <Text accessibilityRole="alert" style={styles.error}>Could not load items: {error}</Text>}
      {actionError && <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>}
      {!loading && !error && visible.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{search.trim() ? "No matching items" : shopping ? "Your list is clear" : "Your pantry is empty"}</Text>
          <Text style={styles.message}>{search.trim() ? "Try a different search." : shopping ? "Add an item or mark pantry items as finished." : "Add your first kitchen item to get started."}</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.list}>
        {deleted.length > 0 && <View accessibilityLabel="Recently deleted items" style={styles.deletedItems}>
          {deleted.map(({ id, item }) => <View key={id} style={styles.deletedItem}>
            <Text style={styles.deletedText}>{item.name} deleted · {Math.max(0, Math.ceil(((item.deletedAt?.toMillis() ?? 0) + itemUndoMilliseconds - now.getTime()) / 1000))}s to undo</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Undo deletion of ${item.name}`} onPress={() => void undoDelete(id)} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Undo</Text>
            </Pressable>
          </View>)}
        </View>}
        {visible.map(({ id, item }) => (
          <InventoryItemRow
            key={id}
            item={item}
            shopping={shopping}
            onEdit={() => { setEditing({ id, item }); setAdding(false); }}
            onFinish={() => void changeState(id, "finished")}
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
            onDelete={() => removeItem(id)}
          />
        ))}
      </ScrollView>
      <Modal animationType="fade" transparent visible={adjustTarget !== null} onRequestClose={() => { if (!adjustBusy) setAdjustTarget(null); }}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardAvoidingView}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>{adjustTarget?.direction === "add" ? "Add to" : "Subtract from"} {adjustTarget?.item.name}</Text>
              <Text style={styles.label}>Current quantity: {adjustTarget && formatQuantity(adjustTarget.item.quantity)}</Text>
              <Text style={styles.label}>Amount</Text>
              <TextInput accessibilityLabel="Adjustment amount" keyboardType="decimal-pad" value={adjustAmount} onChangeText={setAdjustAmount} style={styles.input} />
              {adjustError && <Text accessibilityRole="alert" style={styles.error}>{adjustError}</Text>}
              <View style={styles.formActions}>
                <Pressable accessibilityRole="button" disabled={adjustBusy} onPress={() => setAdjustTarget(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={adjustBusy} onPress={() => void saveAdjustment()} style={styles.primaryButton}><Text style={styles.primaryText}>Update quantity</Text></Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => { Keyboard.dismiss(); setAdding(false); setEditing(null); }}
        transparent
        visible={adding || editing !== null}
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.dialog}>
              <Text style={styles.eyebrow}>KITCHEN INVENTORY</Text>
              <Text style={styles.dialogTitle}>{editing ? "Edit item" : "Add an item"}</Text>
              <ScrollView
                contentContainerStyle={styles.formScroll}
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                keyboardShouldPersistTaps="handled"
              >
                <ItemForm
                  existing={editing}
                  state={shopping ? "toBuy" : "inStock"}
                  onClose={() => { Keyboard.dismiss(); setAdding(false); setEditing(null); }}
                />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setRestockTarget(null)}
        transparent
        visible={restockTarget !== null}
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.dialog}>
              <Text style={styles.eyebrow}>UPDATE PANTRY</Text>
              <Text style={styles.dialogTitle}>Restock {restockTarget?.item.name}</Text>
              <Text style={styles.label}>New stock quantity</Text>
              <TextInput
                accessibilityLabel="New stock quantity"
                autoFocus
                keyboardType="decimal-pad"
                onChangeText={setRestockQuantity}
                placeholder="e.g. 3"
                style={styles.input}
                value={restockQuantity}
              />
              {restockError && <Text accessibilityRole="alert" style={styles.error}>{restockError}</Text>}
              <View style={styles.formActions}>
                <Pressable accessibilityRole="button" onPress={() => setRestockTarget(null)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => void saveRestock()} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Save stock</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 18, backgroundColor: "#f5f8f2" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  headingText: { flex: 1 },
  headingActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  swipeHint: { color: "#748078", fontSize: 11, marginTop: -14, marginBottom: 12 },
  searchInput: { borderWidth: 1, borderColor: "#dfe7df", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: "#273a2e", backgroundColor: "#fff", marginBottom: 12 },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#26392e", fontSize: 29, fontWeight: "800", marginTop: 4 },
  primaryButton: { backgroundColor: "#31835d", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  primaryText: { color: "#fff", fontWeight: "700" },
  list: { gap: 10, paddingBottom: 20 },
  deletedItems: { gap: 8, marginBottom: 12 },
  deletedItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#edf2ed", borderRadius: 9, padding: 8 },
  deletedText: { flex: 1, color: "#47584c", fontSize: 12 },
  swipeContainer: { borderRadius: 14 },
  itemCard: { minHeight: 75, backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  stockCriticalCard: { backgroundColor: "#b42318", borderColor: "#b42318" },
  stockLowCard: { backgroundColor: "#b45309", borderColor: "#b45309" },
  swipeAction: { width: 88, minHeight: 75, alignItems: "center", justifyContent: "center" },
  restockAction: { backgroundColor: "#31835d", borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  deleteAction: { backgroundColor: "#b53c37", borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  swipeActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  itemText: { flex: 1 },
  pantryItemText: { flexBasis: "100%" },
  itemName: { color: "#2e4035", fontSize: 15, fontWeight: "700" },
  boughtItemName: { color: "#87928a", textDecorationLine: "line-through" },
  itemDetail: { color: "#748078", fontSize: 11, marginTop: 5 },
  smallButton: { backgroundColor: "#edf2ed", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 9 },
  smallButtonText: { color: "#47584c", fontSize: 11, fontWeight: "600" },
  finished: { color: "#936216", backgroundColor: "#fff3dc", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, overflow: "hidden" },
  stockCardText: { color: "#fff" },
  stockCardButton: { backgroundColor: "rgba(255,255,255,0.18)" },
  stockCardFinished: { color: "#fff", backgroundColor: "rgba(255,255,255,0.18)" },
  check: { paddingRight: 4 },
  checkText: { color: "#31835d", fontSize: 22 },
  stockMarker: { width: 10, height: 10, borderRadius: 5 },
  stockMarkerCritical: { backgroundColor: "#c83e3e" },
  stockMarkerLow: { backgroundColor: "#e69a27" },
  empty: { backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyTitle: { color: "#26392e", fontSize: 17, fontWeight: "700" },
  message: { color: "#748078", fontSize: 13, textAlign: "center", marginTop: 8 },
  error: { color: "#a53b32", backgroundColor: "#fff0ee", padding: 10, borderRadius: 8, marginBottom: 10 },
  backdrop: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(21,36,26,.36)" },
  keyboardAvoidingView: { width: "100%", maxHeight: "90%" },
  dialog: { backgroundColor: "#fff", borderRadius: 20, padding: 22 },
  dialogTitle: { color: "#26392e", fontSize: 22, fontWeight: "800", marginTop: 6, marginBottom: 16 },
  formScroll: { flexGrow: 1 },
  form: { gap: 10 },
  label: { color: "#69766d", fontSize: 12, fontWeight: "600", marginTop: 5 },
  pickerChevron: { color: "#748078", fontSize: 18, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "#dfe7df", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, color: "#273a2e", backgroundColor: "#fff" },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, marginTop: 12 },
  secondaryButton: { backgroundColor: "#edf2ed", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: "#47584c", fontWeight: "600" }
});
