import { test } from "node:test";
import assert from "node:assert/strict";
import { readScans, recordScan, getHuntSnapshot } from "./hunt-progress";
test("ignores corrupt saved progress and invalid barcodes", () => {
  assert.deepEqual(readScans("invalid"), []);
  assert.deepEqual(readScans("{}"), []);
  assert.deepEqual(readScans('[null,3,"4006381333932"]'), []);
});
test("deduplicates UPC and equivalent EAN values and caps the hunt at three", () => {
  assert.deepEqual(
    readScans(
      '["036000291452","0036000291452","4006381333931","96385074","5901234123457"]',
    ),
    ["0036000291452", "4006381333931", "96385074"],
  );
});
test("validated scans persist, invalid or repeated scans do not advance tasks", () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  recordScan("4006381333932");
  assert.equal(readScans(getHuntSnapshot()).length, 0);
  recordScan("4006381333931");
  recordScan("4006381333931");
  assert.equal(readScans(getHuntSnapshot()).length, 1);
  recordScan("036000291452");
  recordScan("0036000291452");
  assert.equal(readScans(getHuntSnapshot()).length, 2);
  recordScan("96385074");
  recordScan("5901234123457");
  assert.equal(readScans(getHuntSnapshot()).length, 3);
});
