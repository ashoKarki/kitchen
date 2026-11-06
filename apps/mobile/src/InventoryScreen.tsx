import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import ReanimatedSwipeable, { SwipeDirection } from "react-native-gesture-handler/ReanimatedSwipeable";
import RNPickerSelect from "react-native-picker-select";
import { pickerSelectStyle } from "./pickerStyles";
import { useToast } from "./toast";
import {
  createItem,
  completeShoppingList,
  deleteItem,
  expenseCategories,
  itemsForPurchaseCompletion,
  itemsForView,
  setItemBought,
  updateItem,
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
  const [quantity, setQuantity] = useState(String(existing?.item.quantity ?? 1));
  const [category, setCategory] = useState<ExpenseCategory>(existing?.item.category ?? "Other");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const minimumQuantity = existing && existing.item.state !== "toBuy" ? 0 : state === "toBuy" ? 1 : 0;

  async function save() {
    const parsedQuantity = Number(quantity);
    if (!name.trim()) {
      setError("Enter an item name.");
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < minimumQuantity || parsedQuantity > 9999) {
      setError(`Quantity must be a whole number between ${minimumQuantity} and 9999.`);
      return;
    }

    setSaving(true);
    setError(null);
    const newItem: NewKitchenItem = {
      name: name.trim(),
      quantity: parsedQuantity,
      category,
      state
    };
    try {
      if (existing) {
        await updateItem(getDatabase(), existing.id, {
          name: newItem.name,
          quantity: newItem.quantity,
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
        keyboardType="number-pad"
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
  onDelete
}: {
  item: KitchenItem;
  shopping: boolean;
  onEdit: () => void;
  onFinish: () => void;
  onBought: (bought: boolean) => void;
  onRestock: () => void;
  onDelete: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const deleteOffset = useRef(new Animated.Value(0)).current;
  const [deleting, setDeleting] = useState(false);
  const opacity = deleteOffset.interpolate({
    inputRange: [-width, 0],
    outputRange: [0, 1],
    extrapolate: "clamp"
  });

  function triggerDelete() {
    if (deleting) return;
    setDeleting(true);
    Animated.timing(deleteOffset, {
      toValue: -width,
      duration: 220,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) return;
      void onDelete().catch(() => {
        setDeleting(false);
        Animated.spring(deleteOffset, {
          toValue: 0,
          useNativeDriver: true
        }).start();
      });
    });
  }

  return (
    <ReanimatedSwipeable
      enabled={!deleting}
      friction={2}
      leftThreshold={40}
      onSwipeableOpen={(direction) => {
        if (direction === SwipeDirection.LEFT) {
          triggerDelete();
        } else if (!shopping) {
          onRestock();
        }
      }}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(_progress, _translation, methods) => shopping ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Restock ${item.name}`}
            onPress={() => {
              methods.close();
              onRestock();
            }}
            style={[styles.swipeAction, styles.restockAction]}
          >
            <Text style={styles.swipeActionText}>Restock</Text>
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
      <Animated.View
        accessibilityHint={shopping
          ? "Swipe left to reveal delete."
          : "Swipe right to reveal restock or left to reveal delete."}
        style={[
          styles.itemCard,
          !shopping && item.quantity === 1 && styles.stockCriticalCard,
          !shopping && item.quantity !== 1 && item.quantity <= 3 && styles.stockLowCard,
          { opacity, transform: [{ translateX: deleteOffset }] }
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
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.itemText}>
          <Text style={[
            styles.itemName,
            shopping && item.bought && styles.boughtItemName,
            !shopping && item.quantity <= 3 && styles.stockCardText
          ]}>{item.name}</Text>
          <Text style={[
            styles.itemDetail,
            shopping && item.bought && styles.boughtItemName,
            !shopping && item.quantity <= 3 && styles.stockCardText
          ]}>
            Qty {item.quantity} · {item.category}
          </Text>
        </Pressable>
        {item.state === "finished" && (
          <Text style={[styles.finished, !shopping && item.quantity <= 3 && styles.stockCardFinished]}>
            Finished
          </Text>
        )}
        {!shopping && item.state === "inStock" && (
          <Pressable
            accessibilityRole="button"
            onPress={onFinish}
            style={[styles.smallButton, item.quantity <= 3 && styles.stockCardButton]}
          >
            <Text style={[styles.smallButtonText, item.quantity <= 3 && styles.stockCardText]}>Mark finished</Text>
          </Pressable>
        )}
      </Animated.View>
    </ReanimatedSwipeable>
  );
}

export default function InventoryScreen({ shopping = false }: { shopping?: boolean }) {
  const { showToast } = useToast();
  const { data: items, error, loading } = useItems();
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<{ id: string; item: KitchenItem } | null>(null);
  const [adding, setAdding] = useState(false);
  const [restockTarget, setRestockTarget] = useState<{ id: string; item: KitchenItem } | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockError, setRestockError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const visible = itemsForView(items ?? [], shopping ? "shopping" : "pantry", now);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
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
      showToast("Item deleted.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setActionError(message);
      showToast(message, "error");
      throw caught;
    }
  }

  async function markBought(id: string, bought: boolean) {
    const allShoppingItems = itemsForView(items ?? [], "shopping");
    const purchaseItems = itemsForPurchaseCompletion(allShoppingItems);
    const target = allShoppingItems.find(({ id: itemId }) => itemId === id);
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
      setActionError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setActionError(message);
      showToast(message, "error");
    }
  }

  async function saveRestock() {
    const quantity = Number(restockQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      setRestockError("Enter a whole number between 1 and 9999.");
      showToast("Enter a whole number between 1 and 9999.", "error");
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
      setActionError(null);
      showToast("Item restocked.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setRestockError(message);
      showToast(message, "error");
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>{shopping ? "YOUR NEXT SHOP" : "IN YOUR KITCHEN"}</Text>
          <Text style={styles.title}>{shopping ? "Shopping List" : "Pantry"}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setAdding(true); }} style={styles.primaryButton}>
          <Text style={styles.primaryText}>＋ Add</Text>
        </Pressable>
      </View>
      <Text style={styles.swipeHint}>
        {shopping ? "Tap to mark bought · swipe left to delete" : "Swipe right to restock · left to delete"}
      </Text>
      {loading && <Text style={styles.message}>Loading items…</Text>}
      {error && !loading && <Text accessibilityRole="alert" style={styles.error}>Could not load items: {error}</Text>}
      {actionError && <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>}
      {!loading && !error && visible.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{shopping ? "Your list is clear" : "Your pantry is empty"}</Text>
          <Text style={styles.message}>{shopping ? "Add an item or mark pantry items as finished." : "Add your first kitchen item to get started."}</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.list}>
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
            onDelete={() => removeItem(id)}
          />
        ))}
      </ScrollView>
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
                keyboardType="number-pad"
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
  swipeHint: { color: "#748078", fontSize: 11, marginTop: -14, marginBottom: 12 },
  eyebrow: { color: "#7e9c88", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#26392e", fontSize: 29, fontWeight: "800", marginTop: 4 },
  primaryButton: { backgroundColor: "#31835d", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  primaryText: { color: "#fff", fontWeight: "700" },
  list: { gap: 10, paddingBottom: 20 },
  swipeContainer: { borderRadius: 14 },
  itemCard: { minHeight: 75, backgroundColor: "#fff", borderColor: "#e8eee8", borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  stockCriticalCard: { backgroundColor: "#b42318", borderColor: "#b42318" },
  stockLowCard: { backgroundColor: "#b45309", borderColor: "#b45309" },
  swipeAction: { width: 88, minHeight: 75, alignItems: "center", justifyContent: "center" },
  restockAction: { backgroundColor: "#31835d", borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  deleteAction: { backgroundColor: "#b53c37", borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  swipeActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  itemText: { flex: 1 },
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
