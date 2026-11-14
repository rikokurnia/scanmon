import fs from "node:fs";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import {
  Account,
  KeyPair,
  KeyPairSigner,
  providers,
  transactions,
} from "near-api-js";

nextEnv.loadEnvConfig(process.cwd());
const game = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID;
assert.ok(game?.endsWith(".testnet"), "Testnet contract required");

const provider = new providers.JsonRpcProvider({
  url: process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com",
});
assert.equal(process.env.NEAR_DEPLOYER_ACCOUNT_ID, game);

const root = new Account(
  game,
  provider,
  KeyPairSigner.fromSecretKey(process.env.NEAR_DEPLOYER_PRIVATE_KEY),
);

const before = await provider.callFunction(game, "get_config", {});
const wasm = fs.readFileSync(
  "smartcontract/target/wasm32-unknown-unknown/release/scanmon_game.wasm",
);

const deployed = await root.deployContract(wasm);
assert.ok(!deployed.status.Failure, "WASM deploy failed");
assert.deepEqual(
  await provider.callFunction(game, "get_config", {}),
  before,
  "Existing contract configuration must survive upgrade",
);

const kobanPub = Array.from(
  KeyPair.fromString(process.env.NEAR_KOBAN_PRIVATE_KEY).getPublicKey().data,
);
const configured = await root.signAndSendTransaction({
  receiverId: game,
  actions: [
    transactions.functionCall(
      "configure_koban_signer",
      { public_key: kobanPub },
      50000000000000n,
      0n,
    ),
  ],
  waitUntil: "FINAL",
});
assert.ok(!configured.status.Failure, "configure_koban_signer failed");

fs.writeFileSync(
  "smartcontract/deployments/koban-negotiation-upgrade.json",
  JSON.stringify(
    {
      network: "testnet",
      contractId: game,
      upgradedAt: new Date().toISOString(),
      receipts: [
        {
          step: "Upgrade game: signed real-time Koban offer settlement",
          hash: deployed.transaction.hash,
        },
        {
          step: "Configure Koban Ed25519 offer signer",
          hash: configured.transaction.hash,
        },
      ],
    },
    null,
    2,
  ) + "\n",
);

console.log(
  "Upgraded contract and configured Koban offer signer:",
  deployed.transaction.hash,
  configured.transaction.hash,
);
