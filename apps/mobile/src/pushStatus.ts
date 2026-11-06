import { createContext, useContext } from "react";

export const PushStatusContext = createContext<string>("Setting up push notifications…");

export function usePushStatus(): string {
  return useContext(PushStatusContext);
}
