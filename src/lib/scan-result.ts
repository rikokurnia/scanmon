import { validateBarcode } from "./barcode";
import { CARD_CATALOG, type CardId } from "../app/collection/card-catalog";
export interface ScanResult {
  id: string;
  barcode: string;
  cardId: CardId;
}
// Frontend-only roster v1. Replace this resolver with the scan service when connected.
// Doge and the boss have no supplied front-idle artwork and are not in this roster.
const roster: CardId[] = [
  "nyan-cat",
  "pikachu",
  "gengar",
  "pepe",
  "veemon",
  "piyomon",
  "chill-guy",
];
export function resolveScanResult(input: string): ScanResult | null {
  const valid = validateBarcode(input);
  if (!valid) return null;
  const barcode = valid.length === 12 ? `0${valid}` : valid;
  const hash = [...barcode].reduce((n, d) => (n * 31 + Number(d)) >>> 0, 0);
  return {
    id: `scan:v1:${barcode}`,
    barcode,
    cardId: roster[hash % roster.length],
  };
}
export function resolveRevealAssets(result: ScanResult) {
  if (!roster.includes(result.cardId)) return null;
  return {
    ...CARD_CATALOG[result.cardId],
    idleSrc: `/assets/front-idle/${result.cardId}.gif`,
  };
}
