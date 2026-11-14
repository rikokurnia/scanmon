import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionMessage,
  createPvp,
  normalizeUsername,
  resolvePvpRound,
} from "./engine";
const teams: Parameters<typeof createPvp>[0] = [
  [
    { tokenId: "a1", cardId: "pikachu" },
    { tokenId: "a2", cardId: "gengar" },
    { tokenId: "a3", cardId: "veemon" },
  ],
  [
    { tokenId: "b1", cardId: "veemon" },
    { tokenId: "b2", cardId: "gengar" },
    { tokenId: "b3", cardId: "pikachu" },
  ],
];
test("simultaneous PvP actions apply once to the same pre-round state", () => {
  const initial = createPvp(teams);
  const { state, hits } = resolvePvpRound(initial, [
    { round: 1, actor: "a1", target: "b1", skill: "strike" },
    { round: 1, actor: "b1", target: "a1", skill: "strike" },
  ]);
  assert.equal(state.teams[0][0].hp, 85);
  assert.equal(state.teams[1][0].hp, 75);
  assert.equal(state.round, 2);
  assert.equal(hits.length, 2);
  assert.equal(initial.teams[0][0].hp, 120);
  assert.throws(() =>
    resolvePvpRound(state, [
      { round: 1, actor: "a1", target: "b1", skill: "strike" },
      { round: 1, actor: "b1", target: "a1", skill: "strike" },
    ]),
  );
});
test("foreign actors and teammates as targets are rejected", () => {
  assert.throws(() =>
    resolvePvpRound(createPvp(teams), [
      { round: 1, actor: "b1", target: "b2", skill: "strike" },
      { round: 1, actor: "b1", target: "a1", skill: "strike" },
    ]),
  );
});
test("signed action bytes bind the contract, room, round, actor and target", () => {
  const action = {
    round: 1,
    actor: "a1",
    target: "b1",
    skill: "strike" as const,
  };
  assert.notEqual(
    actionMessage("game.testnet", "room-a", action),
    actionMessage("game.testnet", "room-b", action),
  );
  assert.throws(() => actionMessage("game.testnet", "room|other", action));
  assert.equal(normalizeUsername(" Hunter_27 "), "hunter_27");
  assert.throws(() => normalizeUsername("wallet.near"));
});
