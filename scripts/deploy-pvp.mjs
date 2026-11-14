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
assert.ok(game?.endsWith(".testnet"));
const provider = new providers.JsonRpcProvider({
  url: process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com",
});
assert.equal(process.env.NEAR_DEPLOYER_ACCOUNT_ID, game);
const root = new Account(
  game,
  provider,
  KeyPairSigner.fromSecretKey(process.env.NEAR_DEPLOYER_PRIVATE_KEY),
);
const free = (await root.getState()).balance.available;
if (free < 800000000000000000000000n) {
  const qa = new Account(
    process.env.NEAR_QA_BOB_ACCOUNT_ID,
    provider,
    KeyPairSigner.fromSecretKey(process.env.NEAR_QA_BOB_PRIVATE_KEY),
  );
  await qa.signAndSendTransaction({
    receiverId: game,
    actions: [transactions.transfer(1000000000000000000000000n)],
    waitUntil: "FINAL",
  });
  console.log("Added 1 test NEAR from QA account for contract storage.");
}
const before = await provider.callFunction(game, "get_config", {});
const deployed = await root.deployContract(
  fs.readFileSync(
    "smartcontract/target/wasm32-unknown-unknown/release/scanmon_game.wasm",
  ),
);
assert.ok(!deployed.status.Failure);
assert.deepEqual(await provider.callFunction(game, "get_config", {}), before);
const publicKey = Array.from(
  KeyPair.fromString(process.env.NEAR_SPONSOR_PRIVATE_KEY).getPublicKey().data,
);
const configured = await root.signAndSendTransaction({
  receiverId: game,
  actions: [
    transactions.functionCall(
      "configure_pvp",
      { public_key: publicKey },
      50000000000000n,
      10000000000000000000000n,
    ),
  ],
  waitUntil: "FINAL",
});
assert.ok(!configured.status.Failure);
fs.writeFileSync(
  "smartcontract/deployments/pvp-upgrade.json",
  JSON.stringify(
    {
      network: "testnet",
      contractId: game,
      deployedAt: new Date().toISOString(),
      receipts: [
        { step: "Deploy PvP escrow", hash: deployed.transaction.hash },
        {
          step: "Configure PvP result verifier",
          hash: configured.transaction.hash,
        },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PvP testnet contract upgraded and referee configured; existing configuration preserved.",
);
