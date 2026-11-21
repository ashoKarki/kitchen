import { useEffect, useState } from "react";
import { expiryWarnings } from "@my-kitchen/shared";
import { useItems } from "./hooks";

export function useExpiryWarnings() {
  const items = useItems();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return { ...items, warnings: expiryWarnings(items.data ?? [], now), now };
}
