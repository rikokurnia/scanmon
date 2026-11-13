import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChainPlayer, Call } from "./types";
import type { Outcome } from "./rpc";
test("raid start, switch-independent turns and reload use zero wallet calls; only victorious NFT Claim sends one transaction", async (t) => {
  process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID ||= "qa-game.testnet";
  process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ||= "qa-usdc.testnet";
  const {
    setWallet,
    refreshGame,
    gameSnapshot,
    startRaid,
    attack,
    claimBossReward,
    saveTeam,
  } = await import("./game-store");
  const { GAME_ID } = await import("./config");
  const previousFetch = globalThis.fetch;
  const data = new Map<string, string>();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    oldLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
    oldSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, old] of [
      ["window", oldWindow],
      ["localStorage", oldLocal],
      ["sessionStorage", oldSession],
    ] as const) {
      if (old) Object.defineProperty(globalThis, key, old);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let minted = false;
  const account = "qa-raid.testnet";
  const cards = [
    {
      token_id: "p",
      card_id: "pikachu" as const,
      barcode: "1",
      owner_id: account,
    },
    {
      token_id: "v",
      card_id: "veemon" as const,
      barcode: "2",
      owner_id: account,
    },
    {
      token_id: "g",
      card_id: "gengar" as const,
      barcode: "3",
      owner_id: account,
    },
  ];
  const result = {
    status: { SuccessValue: Buffer.from("{}").toString("base64") },
    transaction: {
      hash: "qa-only-claim",
      signer_id: account,
      receiver_id: GAME_ID,
    },
    receipts_outcome: [
      {
        outcome: {
          status: {},
          executor_id: GAME_ID,
          logs: [
            "EVENT_JSON:" +
              JSON.stringify({
                standard: "scanmon",
                event: "boss_reward",
                data: [{ account_id: account, token_id: "boss:nft" }],
              }),
          ],
        },
      },
    ],
  } satisfies Outcome;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === "tx") return Response.json({ result });
    const method = body.params.method_name;
    const player: ChainPlayer = {
      cards: minted
        ? [
            ...cards,
            {
              token_id: "boss:nft",
              card_id: "almarts27-hamster-boss",
              barcode: "boss:first-clear:v1",
              owner_id: account,
            },
          ]
        : cards,
      shards: "0",
      usdc_credit: "0",
      discoveries: 3,
      first_win: minted,
      claims: [],
      locked_ids: [],
      raid: null,
      boss_reward_token: minted ? "boss:nft" : null,
    };
    const value =
      method === "get_player"
        ? player
        : method === "get_shop" || method === "get_listings"
          ? []
          : method === "get_config"
            ? { tomo_budget: "0", koban_budget: "0" }
            : method === "ft_balance_of"
              ? "0"
              : method === "storage_balance_of"
                ? {}
                : false;
    if (body.params.request_type === "view_account")
      return Response.json({ result: { amount: "1000000000000000000000000" } });
    return Response.json({
      result: { result: [...Buffer.from(JSON.stringify(value))] },
    });
  };
  const calls: Call[] = [];
  setWallet(
    account,
    "QA wallet",
    async (call) => {
      calls.push(call);
      assert.equal(call.methodName, "claim_boss_reward");
      minted = true;
      return result;
    },
    null,
  );
  await refreshGame();
  await saveTeam(["p", "v", "g"]);
  await startRaid(["p", "v", "g"]);
  assert.equal(gameSnapshot().proof, null);
  await assert.rejects(claimBossReward(), /Defeat the boss/);
  for (const instanceId of ["p", "p", "p", "v", "v"]) {
    const before = gameSnapshot().raidSession!.battle;
    await attack({
      battleId: before.id,
      round: before.round,
      instanceId,
      skillId: "strike",
    });
  }
  assert.equal(calls.length, 0);
  assert.equal(gameSnapshot().proof, null);
  assert.equal(gameSnapshot().raidSession?.battle.phase, "won");
  await assert.rejects(
    attack({ battleId: "stale", round: 1, instanceId: "p", skillId: "strike" }),
    /round has changed/,
  );
  await claimBossReward();
  assert.equal(calls.length, 1);
  assert.equal((calls[0].args.actions as unknown[]).length, 5);
  assert.equal(gameSnapshot().proof?.phase, "success");
  assert.ok(
    gameSnapshot().player?.cards.some(
      (card) => card.card_id === "almarts27-hamster-boss",
    ),
  );
  assert.equal(gameSnapshot().player?.boss_reward_token, "boss:nft");
  setWallet(null, null, null, null);
  await refreshGame();
});
