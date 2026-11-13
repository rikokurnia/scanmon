"use client";
import { useSyncExternalStore } from "react";
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
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => adapter?.getSnapshot() ?? empty;
export function useBattle() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  return { snapshot, adapter };
}
