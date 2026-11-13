import { isKnownCardId } from "../app/collection/card-catalog";
import type { ScanResult } from "./scan-result";
const KEY = "scanmon:collection:v1",
  EVENT = "scanmon:collection-changed";
export function readCollection(raw: string): ScanResult[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (r): r is ScanResult =>
        r &&
        typeof r.id === "string" &&
        typeof r.barcode === "string" &&
        typeof r.cardId === "string" &&
        isKnownCardId(r.cardId),
    );
  } catch {
    return [];
  }
}
export function collectionSnapshot() {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
export function addRevealedCard(result: ScanResult) {
  const cards = readCollection(collectionSnapshot());
  if (cards.some((c) => c.id === result.id || c.barcode === result.barcode))
    return;
  // Fail visibly rather than telling the player the card was saved when storage failed.
  localStorage.setItem(KEY, JSON.stringify([...cards, result]));
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeCollection(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
