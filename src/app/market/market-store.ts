"use client";

import { useSyncExternalStore } from "react";
import type { MarketAdapter, MarketSnapshot } from "./market-interface";

const emptySnapshot: MarketSnapshot = {
  catalog: [],
  ownedCards: [],
  loading: false,
  error: null,
};

let adapter: MarketAdapter | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;

const notify = () => {
  listeners.forEach((listener) => listener());
};

/**
 * Integration entry point for the shared client provider.
 * Dispose the returned callback when the owning session unmounts.
 */
export function connectMarketAdapter(next: MarketAdapter) {
  unsubscribe?.();
  adapter = next;
  unsubscribe = next.subscribe(notify);
  notify();
  return () => {
    if (adapter === next) {
      unsubscribe?.();
      adapter = null;
      notify();
    }
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => adapter?.getSnapshot() ?? emptySnapshot;

export function useMarket() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => emptySnapshot,
  );
  return { snapshot, adapter };
}
