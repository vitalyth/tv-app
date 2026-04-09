import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot, getServerSnapshot } from "./time-store";

export function useNowSec() {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
}