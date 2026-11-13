// Testnet-only code upgrade. Preserves state and never reinitializes/refunds the pool.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { base58 } from "@scure/base";
import {
  Account,
  KeyPairSigner,
  KeyPair,
  providers,
  transactions,
} from "near-api-js";
nextEnv.loadEnvConfig(process.cwd());
const required = (k) => {
  if (!process.env[k]) throw Error(`Missing ${k}`);
  return process.env[k];
};
const game = required("NEXT_PUBLIC_NEAR_CONTRACT_ID"),
  token = required("NEXT_PUBLIC_USDC_CONTRACT_ID");
if (!game.endsWith(".testnet") || !token.endsWith(".testnet"))
  throw Error("Testnet only");
const provider = new providers.JsonRpcProvider({
  url: process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com",
});
const actor = (label) =>
  new Account(
    required(`NEAR_${label}_ACCOUNT_ID`),
    provider,
    KeyPairSigner.fromSecretKey(required(`NEAR_${label}_PRIVATE_KEY`)),
  );
const root = actor("DEPLOYER"),
  usdc = actor("USDC");
if (root.accountId !== game || usdc.accountId !== token)
  throw Error("Signing accounts do not match deployed contracts");
const view = (id, method, args = {}) =>
  provider.callFunction(id, method, args, { finality: "final" });
const before = await view(game, "get_config");
const receipts = [];
for (const [account, file] of [
  [usdc, "scanmon_mock_usdc.wasm"],
  [root, "scanmon_game.wasm"],
]) {
  const wasm = fs.readFileSync(
    `smartcontract/target/wasm32-unknown-unknown/release/${file}`,
  );
  const hash = base58.encode(createHash("sha256").update(wasm).digest());
  if ((await provider.viewAccount(account.accountId)).code_hash !== hash) {
    const result = await account.deployContract(wasm);
    receipts.push({
      step: `Upgrade ${account.accountId}`,
      hash: result.transaction.hash,
    });
  }
}
const after = await view(game, "get_config");
assert.deepEqual(after, before, "Upgrade must preserve every pool balance");
await view(token, "has_faucet_claimed", { account_id: game });
fs.writeFileSync(
  "smartcontract/deployments/starter-pool-upgrade.json",
  JSON.stringify(
    { network: "testnet", game, token, before, after, receipts },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: both contracts upgraded; existing state and shared budgets preserved.",
);
for (const r of receipts)
  console.log(`${r.step}: https://testnet.nearblocks.io/txns/${r.hash}`);
if (process.argv.includes("--verify-payout")) {
  const key = KeyPair.fromRandom("ed25519");
  const id = `starter-qa-${Date.now().toString(36)}.${game}`;
  await root.signAndSendTransaction({
    receiverId: id,
    actions: [
      transactions.createAccount(),
      transactions.transfer(500000000000000000000000n),
      transactions.addKey(key.getPublicKey(), transactions.fullAccessKey()),
    ],
    waitUntil: "FINAL",
  });
  const qa = new Account(
    id,
    provider,
    KeyPairSigner.fromSecretKey(key.toString()),
  );
  const call = async (receiverId, method, args, deposit) => {
    const r = await qa.signAndSendTransaction({
      receiverId,
      actions: [
        transactions.functionCall(
          method,
          args,
          150000000000000n,
          BigInt(deposit),
        ),
      ],
      waitUntil: "FINAL",
    });
    if (r.status.Failure) throw Error("QA transaction failed");
    return r;
  };
  await call(token, "storage_deposit", {}, 10000000000000000000000n);
  const pool = await view(game, "get_config");
  const supply = await view(token, "ft_total_supply");
  const result = await call(
    game,
    "claim_starter",
    {},
    10000000000000000000000n,
  );
  assert.equal(
    Buffer.from(result.status.SuccessValue, "base64").toString(),
    "true",
  );
  const final = await view(game, "get_config");
  const balance = await view(token, "ft_balance_of", { account_id: id });
  assert.equal(balance, "25000000");
  assert.equal(BigInt(pool.tomo_budget) - BigInt(final.tomo_budget), 25000000n);
  assert.equal(BigInt(final.distributed) - BigInt(pool.distributed), 25000000n);
  assert.equal(await view(token, "ft_total_supply"), supply);
  let rejected = false;
  try {
    await call(game, "claim_starter", {}, 10000000000000000000000n);
  } catch {
    rejected = true;
  }
  assert.ok(rejected);
  fs.writeFileSync(
    "smartcontract/deployments/starter-pool-validation.json",
    JSON.stringify(
      {
        network: "testnet",
        account: id,
        before: pool,
        after: final,
        balance,
        hash: result.transaction.hash,
        totalSupplyUnchanged: true,
        duplicateRejected: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS: player +25 USDC; universal Tomo pool -25 USDC; total supply unchanged; duplicate rejected. https://testnet.nearblocks.io/txns/${result.transaction.hash}`,
  );
}
