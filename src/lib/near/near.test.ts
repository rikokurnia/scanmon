import { test } from "node:test";
import assert from "node:assert/strict";
import { units, displayUnits, explorerTx, GAME_ID } from "./config";
import { assertSucceeded, SettlementError, type Outcome } from "./rpc";
test("USDC conversions retain all six decimals without floating point", () => {
  assert.equal(units("4.909090"), "4909090");
  assert.equal(displayUnits("4909090", 6, 6), "4.909090");
  assert.equal(
    units("12345678901234567890.000001"),
    "12345678901234567890000001",
  );
  assert.throws(() => units("0.0000001"));
  assert.throws(() => units("1e3"));
  assert.throws(() => units("-1"));
  assert.equal(units("0.01", 24), "10000000000000000000000");
});
test("purchases require settlement events and failed payout callbacks never show success", () => {
  const result = {
    status: { SuccessValue: Buffer.from('"0"').toString("base64") },
    transaction: { signer_id: "alice.testnet" },
    receipts_outcome: [],
  } as unknown as Outcome;
  assert.throws(() => assertSucceeded(result, ["trade"]), SettlementError);
  const paid = {
    ...result,
    status: { SuccessValue: Buffer.from('"4909090"').toString("base64") },
    receipts_outcome: [
      {
        outcome: {
          executor_id: GAME_ID,
          status: {},
          logs: [
            "EVENT_JSON:" +
              JSON.stringify({
                standard: "scanmon",
                event: "trade",
                data: [{ account_id: "alice.testnet" }],
              }),
          ],
        },
      },
    ],
  };
  assert.doesNotThrow(() => assertSucceeded(paid, ["trade"]));
  assert.throws(
    () =>
      assertSucceeded(
        {
          ...paid,
          transaction: { ...paid.transaction, signer_id: "eve.testnet" },
        },
        ["trade"],
      ),
    SettlementError,
  );
  assert.throws(
    () =>
      assertSucceeded({
        ...result,
        status: { SuccessValue: Buffer.from("false").toString("base64") },
      }),
    SettlementError,
  );
  assert.throws(
    () => assertSucceeded({ status: { Failure: {} } } as Outcome),
    SettlementError,
  );
  assert.throws(() => assertSucceeded({ status: {} } as Outcome));
});
test("explorer receipts stay on testnet and safely encode hashes", () => {
  assert.equal(
    explorerTx("hash/path"),
    "https://testnet.nearblocks.io/txns/hash%2Fpath",
  );
});
