import { useEffect, useState } from "react";
import { expiryWarnings } from "@my-kitchen/shared";
import { useItems } from "./useItems";

export function useExpiryWarnings() {
  const items = useItems();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { ...items, warnings: expiryWarnings(items.data ?? [], now), now };
}
