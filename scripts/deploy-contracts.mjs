// All signing material is read from ignored env files or the process environment.
// This script never prints keys and is never imported by the frontend.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { base58 } from "@scure/base";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import {
  Account,
  KeyPairSigner,
  providers,
  KeyPair,
  transactions,
} from "near-api-js";
loadEnvConfig(process.cwd());
const rpcUrl =
  process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com";
if (!(rpcUrl.includes("testnet") || rpcUrl === "https://test.rpc.fastnear.com"))
  throw new Error("This script deploys to testnet only.");
const provider = new providers.JsonRpcProvider({ url: rpcUrl });
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}
function account(label) {
  return new Account(
    required(`NEAR_${label}_ACCOUNT_ID`),
    provider,
    KeyPairSigner.fromSecretKey(required(`NEAR_${label}_PRIVATE_KEY`)),
  );
}
const root = account("DEPLOYER");
const logs = [];
async function write(label, result) {
  const hash = result.transaction.hash;
  logs.push({ step: label, hash });
  console.log(`${label}: https://testnet.nearblocks.io/txns/${hash}`);
}
async function exists(id) {
  try {
    await provider.viewAccount(id);
    return true;
  } catch (e) {
    if (/does not exist|doesn.t exist|UNKNOWN_ACCOUNT/.test(String(e)))
      return false;
    throw e;
  }
}
async function ensure(label, near) {
  const id = required(`NEAR_${label}_ACCOUNT_ID`);
  if (await exists(id)) return;
  const pub = KeyPair.fromString(
    required(`NEAR_${label}_PRIVATE_KEY`),
  ).getPublicKey();
  await write(
    `Create ${label}`,
    await root.signAndSendTransaction({
      receiverId: id,
      actions: [
        transactions.createAccount(),
        transactions.transfer(BigInt(near) * 10n ** 21n),
        transactions.addKey(pub, transactions.fullAccessKey()),
      ],
    }),
  );
}
async function call(
  signer,
  contract,
  method,
  args = {},
  deposit = "0",
  gas = "150000000000000",
) {
  const result = await signer.signAndSendTransaction({
    receiverId: contract,
    actions: [
      transactions.functionCall(method, args, BigInt(gas), BigInt(deposit)),
    ],
    waitUntil: "FINAL",
  });
  await write(method, result);
  return result;
}
async function view(id, method, args = {}) {
  return provider.callFunction(id, method, args);
}
try {
  const balance = await root.getState();
  console.log(
    `Deployer: ${root.accountId}; balance ${Number(balance.balance.total) / 1e24} test NEAR`,
  );
  await ensure("USDC", 3300);
  await ensure("TOMO", 350);
  await ensure("KOBAN", 350);
  await ensure("SPONSOR", 800);
  const usdc = account("USDC"),
    tomo = account("TOMO"),
    koban = account("KOBAN");
  const build = path.resolve(
    "smartcontract/target/wasm32-unknown-unknown/release",
  );
  async function deployChanged(account, filename, label) {
    const code = fs.readFileSync(path.join(build, filename));
    const expected = base58.encode(createHash("sha256").update(code).digest());
    if ((await provider.viewAccount(account.accountId)).code_hash !== expected)
      await write(label, await account.deployContract(code));
  }
  await deployChanged(usdc, "scanmon_mock_usdc.wasm", "Deploy mock USDC");
  let initialized = false;
  try {
    await view(usdc.accountId, "ft_metadata");
    initialized = true;
  } catch {}
  if (!initialized)
    await call(usdc, usdc.accountId, "new", { owner_id: root.accountId });
  await deployChanged(root, "scanmon_game.wasm", "Deploy game");
  let config = null;
  try {
    config = await view(root.accountId, "get_config");
  } catch {}
  if (!config)
    await call(root, root.accountId, "new", {
      owner_id: root.accountId,
      usdc_contract_id: usdc.accountId,
      tomo_account_id: tomo.accountId,
      koban_account_id: koban.accountId,
      sponsor_account_id: required("NEAR_SPONSOR_ACCOUNT_ID"),
    });
  for (const who of [root, tomo, koban]) {
    if (
      !(await view(usdc.accountId, "storage_balance_of", {
        account_id: who.accountId,
      }))
    )
      await call(
        root,
        usdc.accountId,
        "storage_deposit",
        { account_id: who.accountId, registration_only: true },
        "10000000000000000000000",
      );
  }
  config = await view(root.accountId, "get_config");
  for (const [agent, key] of [
    [tomo, "tomo"],
    [koban, "koban"],
  ]) {
    if (BigInt(config[`${key}_budget`]) > 0n) continue;
    if (
      BigInt(
        await view(usdc.accountId, "ft_balance_of", {
          account_id: agent.accountId,
        }),
      ) < 500000000n
    )
      await call(root, usdc.accountId, "mint", {
        account_id: agent.accountId,
        amount: "500000000",
      });
    await call(
      agent,
      usdc.accountId,
      "ft_transfer_call",
      { receiver_id: root.accountId, amount: "500000000", msg: key },
      "1",
      "100000000000000",
    );
  }
  const shop = await view(root.accountId, "get_shop");
  if (shop.every((item) => item.stockCount === 0))
    await call(root, root.accountId, "seed_shop");
  const deployment = {
    network: "testnet",
    contractId: root.accountId,
    usdcContractId: usdc.accountId,
    tomoAccountId: tomo.accountId,
    kobanAccountId: koban.accountId,
    sponsorAccountId: required("NEAR_SPONSOR_ACCOUNT_ID"),
    deployedAt: new Date().toISOString(),
    transactions: logs,
  };
  fs.mkdirSync("smartcontract/deployments", { recursive: true });
  fs.writeFileSync(
    "smartcontract/deployments/testnet.json",
    JSON.stringify(deployment, null, 2) + "\n",
  );
  console.log(
    "Contract configuration and finite agent budgets verified. Public receipt manifest: smartcontract/deployments/testnet.json",
  );
} catch (error) {
  console.error(
    `Deployment stopped: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
}
