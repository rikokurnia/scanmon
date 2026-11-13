import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { CARD_CATALOG, resolveCardAsset } from "./card-catalog";

test("CARD_CATALOG resolves all 9 finished card assets to existing public files", () => {
  const expectedIds = [
    "nyan-cat",
    "pikachu",
    "doge",
    "gengar",
    "pepe",
    "veemon",
    "piyomon",
    "chill-guy",
    "almarts27-hamster-boss",
  ] as const;

  assert.equal(Object.keys(CARD_CATALOG).length, expectedIds.length);

  for (const id of expectedIds) {
    const entry = resolveCardAsset(id);
    assert.ok(entry, `Expected catalog entry for ${id}`);
    assert.equal(entry.id, id);
    const diskPath = path.join(
      process.cwd(),
      "public",
      entry.cardImageSrc.replace(/^\//, ""),
    );
    assert.ok(existsSync(diskPath), `Missing card asset file: ${diskPath}`);
  }
});

test("resolveCardAsset returns null for unknown card IDs", () => {
  assert.equal(resolveCardAsset("unknown-card"), null);
  assert.equal(resolveCardAsset(""), null);
});
