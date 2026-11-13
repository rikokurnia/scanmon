// Scoped testnet upgrade and verification. Signing keys stay in ignored environment files.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { base58 } from "@scure/base";
import nextEnv from "@next/env";
import { Account, KeyPairSigner, providers, transactions } from "near-api-js";
nextEnv.loadEnvConfig(process.cwd());
const game = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID;
const rpc =
  process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com";
assert.ok(
  game?.endsWith(".testnet") &&
    (rpc.includes("testnet") || rpc === "https://test.rpc.fastnear.com"),
  "Testnet only",
);
const provider = new providers.JsonRpcProvider({ url: rpc });
const signer = (label) => {
  const id = process.env[`NEAR_${label}_ACCOUNT_ID`],
    key = process.env[`NEAR_${label}_PRIVATE_KEY`];
  if (!id || !key) throw Error(`Missing ${label} signing configuration`);
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key));
};
const root = signer("DEPLOYER");
assert.equal(
  root.accountId,
  game,
  "Upgrade signer must be the existing game contract",
);
const view = (method, args = {}) =>
  provider.callFunction(game, method, args, { finality: "final" });
const before = await view("get_config");
const wasm = fs.readFileSync(
  "smartcontract/target/wasm32-unknown-unknown/release/scanmon_game.wasm",
);
const hash = base58.encode(createHash("sha256").update(wasm).digest());
const receipts = [];
if (process.argv.includes("--deploy")) {
  if ((await provider.viewAccount(game)).code_hash !== hash) {
    const result = await root.deployContract(wasm);
    assert.ok(!result.status.Failure, "Contract upgrade failed");
    receipts.push({
      step: "Upgrade game: single-claim boss NFT",
      hash: result.transaction.hash,
    });
  }
  assert.equal((await provider.viewAccount(game)).code_hash, hash);
  assert.deepEqual(
    await view("get_config"),
    before,
    "Existing game configuration must survive upgrade",
  );
  console.log("Game code upgraded; existing configuration preserved.");
}
if (process.argv.includes("--verify")) {
  const qa = signer("QA_ALICE");
  const getPlayer = () => view("get_player", { account_id: qa.accountId });
  const player = await getPlayer();
  const team = player.cards
    .filter((c) => c.card_id !== "almarts27-hamster-boss")
    .slice(0, 3);
  assert.equal(team.length, 3, "QA account must already own three cards");
  const hp = [120, 120, 120];
  let boss = 360,
    round = 1;
  const actions = [];
  while (boss > 0 && hp.some((h) => h > 0)) {
    const i = hp.indexOf(Math.max(...hp));
    actions.push({ instance_id: team[i].token_id, skill_id: "strike" });
    boss = Math.max(0, boss - (team[i].card_id === "pikachu" ? 85 : 65));
    if (boss > 0) hp[i] = Math.max(0, hp[i] - (round % 3 === 0 ? 50 : 25));
    round++;
  }
  assert.equal(boss, 0, "QA transcript must win");
  async function claim(label) {
    const result = await qa.signAndSendTransaction({
      receiverId: game,
      actions: [
        transactions.functionCall(
          "claim_boss_reward",
          { team_ids: team.map((c) => c.token_id), actions },
          250000000000000n,
          10000000000000000000000n,
        ),
      ],
      waitUntil: "FINAL",
    });
    assert.ok(!result.status.Failure, label);
    const token = JSON.parse(
      Buffer.from(result.status.SuccessValue, "base64").toString(),
    );
    receipts.push({
      step: label,
      accountId: qa.accountId,
      hash: result.transaction.hash,
      tokenId: token.token_id,
    });
    return token;
  }
  const reward = await claim(
    "Claim boss NFT: replay entire raid in one transaction",
  );
  const won = await getPlayer();
  assert.equal(won.boss_reward_token, reward.token_id);
  assert.ok(
    won.cards.some(
      (c) =>
        c.token_id === reward.token_id &&
        c.card_id === "almarts27-hamster-boss",
    ),
  );
  assert.equal(won.raid.phase, "won");
  assert.equal(won.raid.reward.status, "granted");
  assert.deepEqual(won.locked_ids, []);
  const retry = await claim("Retry claim: same NFT, no duplicate mint");
  assert.equal(retry.token_id, reward.token_id);
  assert.equal((await getPlayer()).cards.length, won.cards.length);
  console.log(
    "PASS one claim mints boss NFT to owner vault; repeated claim cannot mint twice.",
  );
}
if (receipts.length) {
  const artifact = {
    network: "testnet",
    contractId: game,
    codeHash: hash,
    verifiedAt: new Date().toISOString(),
    receipts,
  };
  fs.writeFileSync(
    "smartcontract/deployments/boss-reward-upgrade.json",
    JSON.stringify(artifact, null, 2) + "\n",
  );
  for (const receipt of receipts)
    console.log(
      `${receipt.step}: https://testnet.nearblocks.io/txns/${receipt.hash}`,
    );
}
