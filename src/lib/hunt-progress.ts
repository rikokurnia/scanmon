import { validateBarcode } from "./barcode";
const KEY = "scanmon:hunt:v1";
const EVENT = "scanmon:hunt-updated";
export function readScans(snapshot: string): string[] {
  try {
    const values: unknown = JSON.parse(snapshot);
    return Array.isArray(values)
      ? [
          ...new Set(
            values
              .filter(
                (v): v is string =>
                  typeof v === "string" && Boolean(validateBarcode(v)),
              )
              .map((v) => (v.length === 12 ? `0${v}` : v)),
          ),
        ].slice(0, 3)
      : [];
  } catch {
    return [];
  }
}
export function getHuntSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
export function recordScan(input: string) {
  const code = validateBarcode(input);
  if (!code) return;
  const scans = readScans(getHuntSnapshot());
  const normalized = code.length === 12 ? `0${code}` : code;
  if (scans.includes(normalized) || scans.length >= 3) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...scans, normalized]));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* Scanning still works when browser storage is blocked. */
  }
}
export function subscribeHunt(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

const WIN_KEY = "scanmon:hunt:first-win:v1";
export function getBattleTaskSnapshot(): string {
  try {
    return localStorage.getItem(WIN_KEY) ?? "";
  } catch {
    return "";
  }
}
/** Only a won result supplied by the connected Battle adapter advances this task. */
export function recordBattleTask(result: { id: string; phase: string }) {
  if (result.phase !== "won" || !result.id.trim() || getBattleTaskSnapshot())
    return;
  try {
    localStorage.setItem(WIN_KEY, result.id);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* No false completion if storage is unavailable. */
  }
}
