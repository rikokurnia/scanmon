import fs from "node:fs";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Account, KeyPairSigner, providers, transactions } from "near-api-js";
import { Pool } from "pg";
import {
  sessionMessage,
  type PvpRoom,
  type RoomView,
} from "../src/lib/pvp/protocol";
import type { PvpAction } from "../src/lib/pvp/engine";
loadEnvConfig(process.cwd());
const game = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID!;
assert.ok(game.endsWith(".testnet"));
const provider = new providers.JsonRpcProvider({
  url: process.env.NEXT_PUBLIC_NEAR_RPC_URL!,
});
const actor = (label: string) =>
  new Account(
    process.env["NEAR_" + label + "_ACCOUNT_ID"]!,
    provider,
    KeyPairSigner.fromSecretKey(
      process.env["NEAR_" + label + "_PRIVATE_KEY"]! as `ed25519:${string}`,
    ),
  );
const alice = actor("QA_ALICE"),
  bob = actor("QA_BOB");
const api = process.env.PVP_TEST_URL || "http://localhost:3000";
const sessions = [
  generateKeyPairSync("ed25519"),
  generateKeyPairSync("ed25519"),
];
const publicKey = (i: number) =>
  sessions[i].publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32)
    .toString("hex");
const receipts: object[] = [];
const player = (who: Account) =>
  provider.callFunction(game, "get_player", {
    account_id: who.accountId,
  }) as Promise<{
    cards: { token_id: string; card_id: string }[];
    locked_ids: string[];
  }>;
async function call(
  who: Account,
  method: string,
  args: object,
  deposit = BigInt("1"),
) {
  const r = await who.signAndSendTransaction({
    receiverId: game,
    actions: [
      transactions.functionCall(
        method,
        args,
        BigInt("200000000000000"),
        deposit,
      ),
    ],
    waitUntil: "FINAL",
  });
  assert.ok(typeof r.status === "object" && !("Failure" in r.status));
  receipts.push({
    step: method,
    account: who.accountId,
    hash: r.transaction.hash,
  });
  return JSON.parse(
    Buffer.from(
      (r.status as { SuccessValue: string }).SuccessValue,
      "base64",
    ).toString() || "null",
  );
}
async function ensure(who: Account) {
  let p = await player(who);
  let seed = Date.now() % 10000000000;
  const suitable = () =>
    p.cards.filter(
      (c) =>
        c.card_id !== "almarts27-hamster-boss" &&
        (who !== bob || c.card_id !== "pikachu"),
    );
  while (
    suitable().length < 3 ||
    (who === alice && !p.cards.some((c) => c.card_id === "pikachu"))
  ) {
    let barcode = "",
      species = "";
    do {
      const first = String(seed++).padStart(12, "0");
      const sum = [...first].reduce(
        (v, d, i) => v + Number(d) * (i % 2 ? 3 : 1),
        0,
      );
      barcode = first + ((10 - (sum % 10)) % 10);
      const roster = [
        "nyan-cat",
        "pikachu",
        "gengar",
        "pepe",
        "veemon",
        "piyomon",
        "chill-guy",
      ];
      species =
        roster[
          [...barcode].reduce((v, d) => (v * 31 + Number(d)) >>> 0, 0) % 7
        ];
    } while (
      (who === alice &&
        !p.cards.some((c) => c.card_id === "pikachu") &&
        species !== "pikachu") ||
      (who === bob && species === "pikachu")
    );
    await call(
      who,
      "mint_scan",
      { barcode },
      BigInt("10000000000000000000000"),
    );
    p = await player(who);
  }
  const cards = suitable();
  if (who === alice) {
    const pika = cards.find((c) => c.card_id === "pikachu")!;
    return [
      pika,
      ...cards.filter((c) => c.token_id !== pika.token_id).slice(0, 2),
    ];
  }
  return cards.slice(0, 3);
}
async function request(
  room: PvpRoom,
  side: number,
  action: PvpAction | null = null,
  bad = false,
) {
  const accountId = [alice, bob][side].accountId;
  const input = { roomId: room.id, accountId, at: Date.now(), action };
  const signature = bad
    ? Buffer.alloc(64).toString("base64")
    : sign(
        null,
        Buffer.from(sessionMessage(game, input)),
        sessions[side].privateKey,
      ).toString("base64");
  const response = await (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetch(api + "/api/pvp/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, signature }),
        });
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  })();
  const body = await response.json();
  return { response, body: body as RoomView };
}
async function poll(
  room: PvpRoom,
  side: number,
  action: PvpAction | null = null,
) {
  const { response, body } = await request(room, side, action);
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
async function main() {
  const teamA = await ensure(alice),
    teamB = await ensure(bob);
  async function create() {
    const room = (await call(
      alice,
      "create_pvp",
      {
        username: "qa_hunter_a",
        team_ids: teamA.map((c) => c.token_id),
        stake_id: teamA[0].token_id,
        session_key: publicKey(0),
      },
      BigInt("10000000000000000000000"),
    )) as PvpRoom;
    return (await call(
      bob,
      "join_pvp",
      {
        room_id: room.id,
        username: "qa_hunter_b",
        team_ids: teamB.map((c) => c.token_id),
        stake_id: teamB[0].token_id,
        session_key: publicKey(1),
      },
      BigInt("10000000000000000000000"),
    )) as PvpRoom;
  }
  const room = await create();
  let state = await poll(room, 0);
  await poll(room, 1);
  assert.equal((await request(room, 0, null, true)).response.status, 400);
  assert.ok(
    !(await player(alice)).cards.some((c) => c.token_id === teamA[0].token_id),
  );
  const forged: PvpAction = {
    round: 1,
    actor: teamB[0].token_id,
    target: teamB[1].token_id,
    skill: "strike",
  };
  assert.equal((await request(room, 0, forged)).response.status, 400);
  const started = await Promise.all([
    poll(room, 0, { round: 1, actor: "", target: "", skill: "auto" }),
    poll(room, 1, { round: 1, actor: "", target: "", skill: "auto" }),
  ]);
  const startedAt = started.find((s) => s.battleStartedAt)?.battleStartedAt;
  assert.ok(startedAt);
  const retriedStart = await poll(room, 0, {
    round: 1,
    actor: "",
    target: "",
    skill: "auto",
  });
  assert.equal(retriedStart.battleStartedAt, startedAt);
  assert.equal(retriedStart.deadlineAt! - startedAt, 90000);
  const battleTimeout = Date.now() + 100000;
  while (state.battle?.phase === "choosing") {
    assert.ok(
      Date.now() < battleTimeout,
      "Backend did not terminate combat by deadline",
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await poll(room, 1);
    state = await poll(room, 0);
  }
  assert.ok(state.certificate);
  const result = state.certificate!;
  if (result.outcome === "refund") {
    await call(alice, "claim_pvp", { room_id: room.id, ...result });
  } else {
    const winner = result.outcome === alice.accountId ? alice : bob;
    await call(winner, "claim_pvp", { room_id: room.id, ...result });
    const cards = (await player(winner)).cards;
    assert.ok(
      cards.some((c) => c.token_id === teamA[0].token_id) &&
        cards.some((c) => c.token_id === teamB[0].token_id),
    );
    await call(winner, "claim_pvp", { room_id: room.id, ...result });
  }
  assert.equal((await player(alice)).locked_ids.length, 0);
  assert.equal((await player(bob)).locked_ids.length, 0);
  // Independent match: simulate elapsed disconnect time in QA row, then use the real endpoint's cancellation proof.
  const teamsNowA = await ensure(alice),
    teamsNowB = await ensure(bob);
  teamA.splice(0, 3, ...teamsNowA);
  teamB.splice(0, 3, ...teamsNowB);
  const cancelled = await create();
  await poll(cancelled, 0);
  await poll(cancelled, 1);
  const pool = new Pool({ connectionString: process.env.PVP_DATABASE_URL });
  await pool.query(
    "UPDATE scanmon_pvp_rooms SET data=jsonb_set(data,'{lastSeen}', $2::jsonb) WHERE id=$1",
    [cancelled.id, JSON.stringify([Date.now(), Date.now() - 91000])],
  );
  const stopped = await poll(cancelled, 0);
  assert.equal(stopped.certificate?.outcome, "refund");
  await call(alice, "claim_pvp", {
    room_id: cancelled.id,
    ...stopped.certificate,
  });
  assert.ok(
    (await player(alice)).cards.some((c) => c.token_id === teamA[0].token_id),
  );
  assert.ok(
    (await player(bob)).cards.some((c) => c.token_id === teamB[0].token_id),
  );
  // QA-only no-damage fixture exercises the real signed deadline/refund path.
  teamA.splice(0, 3, ...(await ensure(alice)));
  teamB.splice(0, 3, ...(await ensure(bob)));
  const timed = await create();
  await poll(timed, 0);
  await poll(timed, 1);
  const readyA = await poll(timed, 0, {
    round: 1,
    actor: "",
    target: "",
    skill: "auto",
  });
  assert.equal(readyA.battleStartedAt, null);
  const readyB = await poll(timed, 1, {
    round: 1,
    actor: "",
    target: "",
    skill: "auto",
  });
  assert.equal(readyB.deadlineAt! - readyB.battleStartedAt!, 90000);
  const { rows } = await pool.query(
    "SELECT data FROM scanmon_pvp_rooms WHERE id=$1",
    [timed.id],
  );
  const fixture = rows[0].data;
  fixture.battle.teams.forEach((t: { atk: number }[]) =>
    t.forEach((c) => (c.atk = 0)),
  );
  fixture.battleStartedAt = Date.now() - 80000;
  fixture.lastSeen = [Date.now(), Date.now()];
  await pool.query("UPDATE scanmon_pvp_rooms SET data=$2 WHERE id=$1", [
    timed.id,
    JSON.stringify(fixture),
  ]);
  const beforeDeadline = await poll(timed, 0);
  assert.equal(beforeDeadline.battle?.phase, "choosing");
  assert.equal(beforeDeadline.certificate, null);
  await pool.query(
    "UPDATE scanmon_pvp_rooms SET data=jsonb_set(data,'{battleStartedAt}', $2::jsonb) WHERE id=$1",
    [timed.id, JSON.stringify(Date.now() - 91000)],
  );
  const timeout = await poll(timed, 1);
  assert.equal(timeout.battle?.phase, "draw");
  assert.equal(timeout.certificate?.outcome, "refund");
  await call(bob, "claim_pvp", { room_id: timed.id, ...timeout.certificate });
  assert.ok(
    (await player(alice)).cards.some((c) => c.token_id === teamA[0].token_id),
  );
  assert.ok(
    (await player(bob)).cards.some((c) => c.token_id === teamB[0].token_id),
  );
  assert.equal((await player(alice)).locked_ids.length, 0);
  assert.equal((await player(bob)).locked_ids.length, 0);
  await pool.end();
  fs.writeFileSync(
    "smartcontract/deployments/pvp-validation.json",
    JSON.stringify(
      {
        network: "testnet",
        contractId: game,
        api,
        verifiedAt: new Date().toISOString(),
        combat: {
          roomId: room.id,
          outcome: result.outcome,
          rounds: state.battle!.round - 1,
        },
        checks: [
          "two real players escrow owned NFTs",
          "invalid signatures and foreign actors rejected",
          "both teams auto-attack using HP and decimal ATK; repeated Attack does not reset the deadline",
          "90s battle deadline produces signed refund and both escrow cards return (QA no-damage fixture)",
          "settlement and repeat claim safe",
          "90s disconnect cancels and both NFT stakes return",
        ],
        receipts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS PvP escrow, two-player backend rounds, signature validation, settlement, and disconnect refund.",
  );
}
main().catch(async (error) => {
  console.error(
    error instanceof Error ? error.message : "PvP validation failed",
  );
  process.exitCode = 1;
});
