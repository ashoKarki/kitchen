import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ToastKind = "success" | "error" | "info";

interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    timers.current.set(id, setTimeout(() => dismissToast(id), 4000));
  }, [dismissToast]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={styles.stack}>
          {toasts.map((toast) => (
            <View
              accessibilityLiveRegion={toast.kind === "error" ? "assertive" : "polite"}
              key={toast.id}
              style={[styles.toast, toast.kind === "error" ? styles.error : toast.kind === "info" ? styles.info : styles.success]}
            >
              <Text style={styles.message}>{toast.message}</Text>
              <Pressable accessibilityLabel="Dismiss notification" accessibilityRole="button" onPress={() => dismissToast(toast.id)} hitSlop={8}>
                <Text style={styles.dismiss}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stack: { position: "absolute", top: 54, left: 12, right: 12, gap: 8, zIndex: 1000 },
  toast: { minHeight: 48, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, elevation: 8, shadowColor: "#17271c", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  success: { backgroundColor: "#24693f" },
  error: { backgroundColor: "#a53b32" },
  info: { backgroundColor: "#354b3c" },
  message: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
  dismiss: { color: "#fff", fontSize: 22, lineHeight: 24 }
});
