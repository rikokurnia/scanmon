import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import {
  Account,
  KeyPair,
  KeyPairSigner,
  providers,
  transactions,
} from "near-api-js";
nextEnv.loadEnvConfig(process.cwd());
const provider = new providers.JsonRpcProvider({
  url: process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com",
});
const game = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
  usdc = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID;
if (!game?.endsWith(".testnet") || !usdc?.endsWith(".testnet"))
  throw new Error("Testnet deployments required.");
function actor(label) {
  const id = process.env[`NEAR_${label}_ACCOUNT_ID`],
    key = process.env[`NEAR_${label}_PRIVATE_KEY`];
  if (!id || !key)
    throw new Error(
      `Set ignored NEAR_${label}_ACCOUNT_ID and NEAR_${label}_PRIVATE_KEY first`,
    );
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key));
}
const alice = actor("QA_ALICE"),
  bob = actor("QA_BOB"),
  root = actor("DEPLOYER"),
  sponsor = actor("SPONSOR");
const resumeSponsor = process.argv.includes("--resume-sponsor");
const previous = resumeSponsor
  ? JSON.parse(
      fs.readFileSync(
        "smartcontract/deployments/testnet-validation.json",
        "utf8",
      ),
    )
  : { receipts: [], checks: [] };
if (
  resumeSponsor &&
  !previous.checks.includes("raid loot cannot be claimed twice")
)
  throw new Error("No completed raid validation checkpoint to resume.");
const receipts = previous.receipts,
  checks = previous.checks;
const storage = 10n ** 22n;
const view = (id, method, args = {}) =>
  provider.callFunction(id, method, args, { finality: "final" });
const player = (who) => view(game, "get_player", { account_id: who.accountId });
const balance = (who) =>
  view(usdc, "ft_balance_of", { account_id: who.accountId });
function check(label, fn) {
  fn();
  checks.push(label);
  console.log(`PASS ${label}`);
}
async function call(
  who,
  id,
  method,
  args = {},
  deposit = 1n,
  gas = 150n * 10n ** 12n,
) {
  const result = await who.signAndSendTransaction({
    receiverId: id,
    actions: [transactions.functionCall(method, args, gas, deposit)],
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  receipts.push({
    step: method,
    account: who.accountId,
    hash: result.transaction.hash,
  });
  if (result.status.Failure)
    throw new Error(
      `${method} failed: ${JSON.stringify(result.status.Failure)}`,
    );
  console.log(`${method}: ${result.transaction.hash}`);
  return result;
}
async function reject(label, who, id, method, args = {}, deposit = 1n) {
  let failed = false;
  try {
    await call(who, id, method, args, deposit);
  } catch {
    failed = true;
  }
  check(label, () => assert.ok(failed));
}
async function register(who) {
  if (!(await view(usdc, "storage_balance_of", { account_id: who.accountId })))
    await call(
      who,
      usdc,
      "storage_deposit",
      { account_id: who.accountId, registration_only: true },
      storage,
    );
}
const decoded = (result) =>
  Buffer.from(result.status.SuccessValue ?? "", "base64").toString();
try {
  if (!resumeSponsor) {
    // Keep the two agent signers and login sponsor comfortably above gas reservation.
    for (const who of [root, sponsor, actor("TOMO"), actor("KOBAN")]) {
      const accountState = await who.getState();
      if (accountState.balance.available < 800n * 10n ** 21n)
        await alice.transfer({ receiverId: who.accountId, amount: 10n ** 24n });
    }
    for (const who of [alice]) {
      await register(who);
      if (BigInt(await balance(who)) === 0n) await call(who, usdc, "faucet");
    }
    for (const barcode of ["4006381333931", "036000291452", "9780201379624"])
      await call(alice, game, "mint_scan", { barcode }, storage);
    const before = await player(alice);
    await call(alice, game, "mint_scan", { barcode: "4006381333931" }, storage);
    const after = await player(alice);
    check("one discovery per canonical barcode", () =>
      assert.equal(before.discoveries, after.discoveries),
    );
    check("three independent owned cards", () =>
      assert.ok(after.cards.length >= 3),
    );
    if (!after.claims.includes("first"))
      await call(alice, game, "claim_task", { task_id: "first" }, storage);
    if (!after.claims.includes("three"))
      await call(alice, game, "claim_task", { task_id: "three" }, storage);
    await reject(
      "quest reward cannot be paid twice",
      alice,
      game,
      "claim_task",
      { task_id: "first" },
      storage,
    );
    const questShards = BigInt((await player(alice)).shards);
    check("quest shards are on-chain", () => assert.ok(questShards >= 15n));
    // A USDC callback failure must restore the budget and release the claim.
    if (
      !(await view(usdc, "storage_balance_of", { account_id: bob.accountId }))
    ) {
      await call(bob, game, "mint_scan", { barcode: "4006381333931" }, storage);
      const budget = BigInt((await view(game, "get_config")).tomo_budget);
      const failed = await call(
        bob,
        game,
        "claim_task",
        { task_id: "first" },
        storage,
      );
      check("failed USDC payout callback returns false", () =>
        assert.equal(decoded(failed), "false"),
      );
      const b = await player(bob);
      check("failed payout releases claim and mints no shards", () => {
        assert.ok(!b.claims.includes("first"));
        assert.equal(b.shards, "0");
      });
      const restoredBudget = BigInt(
        (await view(game, "get_config")).tomo_budget,
      );
      check("failed payout restores finite treasury", () =>
        assert.equal(restoredBudget, budget),
      );
    }
    await register(bob);
    if (BigInt(await balance(bob)) === 0n) await call(bob, usdc, "faucet");
    if (!(await player(bob)).claims.includes("first"))
      await call(bob, game, "claim_task", { task_id: "first" }, storage);
    await reject("mock faucet is one-time", alice, usdc, "faucet");
    const q = await view(game, "quote", {
      card_id: "pikachu",
      direction: "buy",
    });
    const cash = BigInt(await balance(alice));
    await call(
      alice,
      usdc,
      "ft_transfer_call",
      {
        receiver_id: game,
        amount: q.amount,
        msg: JSON.stringify({ action: "buy", card_id: "pikachu" }),
      },
      1n,
      250n * 10n ** 12n,
    );
    const cashAfterBuy = BigInt(await balance(alice));
    check("merchant buy debits exact six-decimal USDC", () =>
      assert.equal(cashAfterBuy, cash - BigInt(q.amount)),
    );
    const bought = (await player(alice)).cards.find(
      (c) => c.card_id === "pikachu" && c.barcode === "",
    );
    assert.ok(bought);
    const sell = await view(game, "quote", {
      card_id: "pikachu",
      direction: "sell",
    });
    const cashBeforeSell = BigInt(await balance(alice));
    const sale = await call(alice, game, "sell_to_koban", {
      token_id: bought.token_id,
      expected_price: sell.amount,
    });
    assert.equal(decoded(sale), "true");
    const cashAfterSell = BigInt(await balance(alice)),
      cardsAfterSell = (await player(alice)).cards;
    check("merchant sale delivers USDC and removes sold token", () => {
      assert.equal(cashAfterSell, cashBeforeSell + BigInt(sell.amount));
      assert.ok(!cardsAfterSell.some((c) => c.token_id === bought.token_id));
    });
    // Reject incorrect-price purchases and return the FT payment.
    const refundCash = BigInt(await balance(alice));
    const rejected = await call(
      alice,
      usdc,
      "ft_transfer_call",
      {
        receiver_id: game,
        amount: "1",
        msg: JSON.stringify({ action: "buy", card_id: "pikachu" }),
      },
      1n,
      250n * 10n ** 12n,
    );
    check("incorrect-price buy refunds all USDC", () => {
      assert.equal(decoded(rejected), '"0"');
    });
    assert.equal(BigInt(await balance(alice)), refundCash);
    const token = (await player(alice)).cards[0];
    await call(
      alice,
      game,
      "mt_transfer_call",
      {
        receiver_id: usdc,
        token_id: token.token_id,
        amount: "1",
        approval: null,
        memo: null,
        msg: "reject",
      },
      1n,
      150n * 10n ** 12n,
    );
    const afterMtRefund = await player(alice);
    check("NEP-245 failed receiver restores ownership", () =>
      assert.ok(
        afterMtRefund.cards.some((card) => card.token_id === token.token_id),
      ),
    );

    const listingResult = await call(
      alice,
      game,
      "list_card",
      { token_id: token.token_id, price: "2000000" },
      storage,
    );
    const listing = JSON.parse(decoded(listingResult));
    const escrowPlayer = await player(alice);
    check("listed card leaves playable collection", () =>
      assert.ok(!escrowPlayer.cards.some((c) => c.token_id === token.token_id)),
    );
    await call(
      bob,
      usdc,
      "ft_transfer_call",
      {
        receiver_id: game,
        amount: "2000000",
        msg: JSON.stringify({ action: "listing", listing_id: listing.id }),
      },
      1n,
      250n * 10n ** 12n,
    );
    const aliceListed = await player(alice),
      bobListed = await player(bob);
    check(
      "two-account player settlement transfers card and credits seller",
      () => {
        assert.ok(bobListed.cards.some((c) => c.token_id === token.token_id));
        assert.equal(aliceListed.usdc_credit, "2000000");
      },
    );
    await reject(
      "sold listing cannot be cancelled twice",
      alice,
      game,
      "cancel_listing",
      { listing_id: listing.id },
    );
    const withdrawalCash = BigInt(await balance(alice));
    await call(alice, game, "withdraw_usdc");
    const withdrawn = BigInt(await balance(alice));
    check("player sale proceeds withdraw to actual NEP-141 wallet", () =>
      assert.equal(withdrawn, withdrawalCash + 2000000n),
    );

    const cancelResult = await call(
      bob,
      game,
      "list_card",
      { token_id: token.token_id, price: "3000000" },
      storage,
    );
    const cancellable = JSON.parse(decoded(cancelResult));
    await call(bob, game, "cancel_listing", { listing_id: cancellable.id });
    const afterCancel = await player(bob);
    check("listing cancellation returns escrowed card", () =>
      assert.ok(
        afterCancel.cards.some((card) => card.token_id === token.token_id),
      ),
    );
    // Refill the raid team with a separate discovery after selling one of its cards.
    await call(alice, game, "mint_scan", { barcode: "5901234123457" }, storage);
    const team = (await player(alice)).cards.slice(0, 3).map((c) => c.token_id);
    await call(alice, game, "start_raid", { team_ids: team }, storage);
    await reject(
      "raid locks prevent selling an active team card",
      alice,
      game,
      "sell_to_koban",
      { token_id: team[0], expected_price: "1" },
    );
    let raid = (await player(alice)).raid;
    while (raid.phase === "choosing") {
      const fighter = raid.team.find((f) => f.hp > 0);
      const result = await call(alice, game, "attack", {
        battle_id: raid.id,
        round: raid.round,
        instance_id: fighter.instanceId,
        skill_id: fighter.skill.id,
      });
      raid = JSON.parse(decoded(result));
    }
    check("authoritative raid reaches victory", () =>
      assert.equal(raid.phase, "won"),
    );
    await call(alice, game, "claim_loot", {}, storage);
    const won = await player(alice);
    check("raid loot is paid once with on-chain shards", () => {
      assert.equal(won.raid.reward.status, "granted");
      assert.equal(won.first_win, true);
      assert.ok(BigInt(won.shards) >= 25n);
    });
    await reject(
      "raid loot cannot be claimed twice",
      alice,
      game,
      "claim_loot",
      {},
      storage,
    );
    if (!won.claims.includes("battle"))
      await call(alice, game, "claim_task", { task_id: "battle" }, storage);
  }
  // Real implicit-account funding, with no key entering the browser.
  let env = fs.readFileSync(".env.local", "utf8");
  let implicitKey = process.env.NEAR_QA_IMPLICIT_PRIVATE_KEY;
  if (!implicitKey) {
    implicitKey = KeyPair.fromRandom("ed25519").toString();
    env += `\nNEAR_QA_IMPLICIT_PRIVATE_KEY=${implicitKey}\n`;
    fs.writeFileSync(".env.local", env, { mode: 0o600 });
  }
  const key = KeyPair.fromString(implicitKey);
  const implicit = Buffer.from(key.getPublicKey().data).toString("hex");
  const identity = createHash("sha256")
    .update("scanmon-qa-google-implicit")
    .digest("hex");
  await call(
    sponsor,
    game,
    "sponsor_player",
    { identity_hash: identity, account_id: implicit },
    520n * 10n ** 21n,
    60n * 10n ** 12n,
  );
  const native = await provider.viewAccount(implicit);
  check("login sponsor funds real NEAR implicit account", () =>
    assert.equal(BigInt(native.amount), 500n * 10n ** 21n),
  );
  await call(
    sponsor,
    game,
    "sponsor_player",
    { identity_hash: identity, account_id: implicit },
    520n * 10n ** 21n,
    60n * 10n ** 12n,
  );
  assert.equal((await provider.viewAccount(implicit)).amount, native.amount);
  check("on-chain sponsorship guard prevents duplicate grants", () =>
    assert.ok(true),
  );
  console.log(`PASS ${checks.length} testnet integration assertions`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.mkdirSync("smartcontract/deployments", { recursive: true });
  fs.writeFileSync(
    "smartcontract/deployments/testnet-validation.json",
    JSON.stringify(
      {
        network: "testnet",
        validatedAt: new Date().toISOString(),
        success: !process.exitCode,
        checks,
        receipts,
      },
      null,
      2,
    ) + "\n",
  );
}
