import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolveScanResult, resolveRevealAssets } from "./scan-result";
import {
  addRevealedCard,
  collectionSnapshot,
  readCollection,
} from "./reveal-collection";
import { peelGeometry } from "./peel";
test("one validated result resolves matching card and character, UPC/EAN stay identical", () => {
  assert.equal(resolveScanResult("4006381333932"), null);
  const result = resolveScanResult("036000291452")!;
  assert.deepEqual(result, resolveScanResult("0036000291452"));
  const assets = resolveRevealAssets(result)!;
  assert.equal(assets.id, result.cardId);
  assert.ok(existsSync(`public${assets.idleSrc}`));
  assert.ok(existsSync(`public${assets.cardImageSrc}`));
});
test("completing or retrying the same reveal adds one owned instance", () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  const result = resolveScanResult("4006381333931")!;
  addRevealedCard(result);
  addRevealedCard(result);
  addRevealedCard({ ...result, id: "repeat" });
  assert.equal(readCollection(collectionSnapshot()).length, 1);
  assert.equal(readCollection(collectionSnapshot())[0].cardId, result.cardId);
});
test("fold reflection maps original upper-right corner onto the dragged corner", () => {
  const geometry = peelGeometry(360, 202.5, 220, 80);
  const [a, b, , d, e, f] = geometry.matrix.slice(7, -1).split(",").map(Number);
  assert.ok(Math.abs(a * 360 + e - 220) < 0.001);
  assert.ok(Math.abs(b * 360 + f - 80) < 0.001);
  assert.ok(Number.isFinite(d));
  assert.ok(!geometry.top.includes("NaN"));
});

test("barcode character mapping is stable, canonical, and reaches every supported character", () => {
  const species = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const body = String(400638100000 + i);
    let sum = 0;
    for (
      let j = body.length - 1, weight = 3;
      j >= 0;
      j--, weight = weight === 3 ? 1 : 3
    )
      sum += Number(body[j]) * weight;
    const code = body + String((10 - (sum % 10)) % 10),
      result = resolveScanResult(code)!;
    assert.ok(result);
    assert.deepEqual(resolveScanResult(code), result);
    assert.deepEqual(resolveScanResult(code.split("").join(" ")), result);
    species.add(result.cardId);
  }
  assert.equal(species.size, 7);
  // Lock existing v1 mappings: changing roster order must not silently remap barcodes.
  assert.equal(resolveScanResult("4006381333931")?.cardId, "pepe");
});
