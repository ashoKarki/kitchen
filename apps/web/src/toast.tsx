import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

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
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    timers.current.set(id, window.setTimeout(() => dismissToast(id), 4000));
  }, [dismissToast]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id} role={toast.kind === "error" ? "alert" : "status"}>
            <span>{toast.message}</span>
            <button aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context;
}
