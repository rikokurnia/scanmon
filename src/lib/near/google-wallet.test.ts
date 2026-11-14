import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoogleWalletActivation } from "./google-wallet";

const missingKey = () =>
  Object.assign(new Error("Access key ed25519:… doesn't exist"), {
    type: "AccessKeyDoesNotExist",
  });

test("failed Google sponsorship blocks signing and can recover on retry", async () => {
  let active = false;
  let attempts = 0;
  const activate = createGoogleWalletActivation({
    checkAccessKey: async () => {
      if (!active) throw missingKey();
    },
    sponsor: async () => {
      attempts++;
      if (attempts === 1)
        throw new Error("Sponsor has insufficient test NEAR.");
      active = true;
    },
  });
  await assert.rejects(activate(), /insufficient test NEAR/);
  await activate();
  assert.equal(active, true);
  assert.equal(attempts, 2);
});

test("mint during Google initialization waits for the same activation", async () => {
  let active = false;
  let requests = 0;
  let finish!: () => void;
  const activation = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const activate = createGoogleWalletActivation({
    checkAccessKey: async () => {
      if (!active) throw missingKey();
    },
    sponsor: async () => {
      requests++;
      await activation;
      active = true;
    },
  });
  const initialization = activate();
  const mint = activate();
  assert.equal(initialization, mint);
  finish();
  await Promise.all([initialization, mint]);
  assert.equal(requests, 1);
});

test("already activated wallets do not request another grant", async () => {
  const activate = createGoogleWalletActivation({
    checkAccessKey: async () => ({}),
    sponsor: async () => {
      assert.fail("No sponsorship needed");
    },
  });
  await activate();
  await activate();
});

test("RPC outages are not treated as missing wallets", async () => {
  const activate = createGoogleWalletActivation({
    checkAccessKey: async () => {
      throw new Error("RPC unavailable");
    },
    sponsor: async () => {
      assert.fail("Must not request a grant during RPC failure");
    },
  });
  await assert.rejects(activate(), /RPC unavailable/);
});

test("sponsorship is not successful until the access key exists on-chain", async () => {
  const activate = createGoogleWalletActivation({
    checkAccessKey: async () => {
      throw missingKey();
    },
    sponsor: async () => {},
  });
  await assert.rejects(activate(), /wallet activation has not completed/i);
});
