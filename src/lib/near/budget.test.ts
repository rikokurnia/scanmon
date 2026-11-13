import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetPercent } from "./budget";
test("agent bar tracks the shared pool after 25 USDC leaves it", () => {
  assert.equal(budgetPercent("500000000", "0"), 100);
  assert.equal(budgetPercent("475000000", "25000000"), 95);
  assert.equal(budgetPercent("25000000", "475000000"), 5);
  assert.equal(budgetPercent("0", "500000000"), 0);
  assert.equal(budgetPercent("0", "0"), 0);
});
