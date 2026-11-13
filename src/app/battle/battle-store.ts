"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useMarket } from "../market/market-store";
import { createCollectionBattleAdapter } from "./collection-battle-adapter";
import type { BattleAdapter, BattleSnapshot } from "./battle-interface";
const empty: BattleSnapshot = {
  ownedCards: [],
  savedTeamIds: [],
  minimumTeamSize: 3,
  loading: false,
  battle: null,
};
let adapter: BattleAdapter | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
const notify = () => listeners.forEach((listener) => listener());
/** Integration entry point. Dispose when the owning session/provider unmounts. */
export function connectBattleAdapter(next: BattleAdapter) {
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
export function useBattle() {
  const { adapter: marketAdapter } = useMarket();
  const fallback = useMemo(
    () => createCollectionBattleAdapter(marketAdapter),
    [marketAdapter],
  );
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      const stop = fallback.subscribe(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
    [fallback],
  );
  const getSnapshot = useCallback(
    () => (adapter ?? fallback).getSnapshot(),
    [fallback],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  return { snapshot, adapter: adapter ?? fallback };
}
