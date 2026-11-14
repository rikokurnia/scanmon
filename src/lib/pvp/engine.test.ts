import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPvp,
  resolveAutoRound,
  advancePvp,
  PVP_STATS,
  PVP_TICK_MS,
  PVP_DURATION_MS,
  normalizeUsername,
  type PvpCard,
} from "./engine";
const team = (prefix: string, ids: PvpCard["cardId"][]): PvpCard[] =>
  ids.map((cardId, i) => ({ tokenId: prefix + i, cardId }));
const teams: [PvpCard[], PvpCard[]] = [
  team("a", ["doge", "pikachu", "veemon"]),
  team("b", ["gengar", "piyomon", "nyan-cat"]),
];
test("every card uses the supplied HP and ATK divided by ten; DEF and rarity do not change damage", () => {
  assert.deepEqual(PVP_STATS, {
    doge: { hp: 80, atk: 90 },
    pepe: { hp: 90, atk: 60 },
    pikachu: { hp: 70, atk: 95 },
    veemon: { hp: 85, atk: 80 },
    "nyan-cat": { hp: 65, atk: 60 },
    piyomon: { hp: 60, atk: 35 },
    gengar: { hp: 70, atk: 50 },
    "chill-guy": { hp: 55, atk: 70 },
    "almarts27-hamster-boss": { hp: 100, atk: 98 },
  });
  for (const [id, stats] of Object.entries(PVP_STATS)) {
    const a = team("a", [id as PvpCard["cardId"], "pepe", "gengar"]);
    const s = createPvp([a, teams[1]]);
    assert.equal(s.teams[0][0].hp, stats.hp);
    assert.equal(s.teams[0][0].atk, stats.atk / 10);
  }
  assert.equal(createPvp(teams).teams[0][0].atk, 9);
  assert.equal(createPvp(teams).teams[0][1].atk, 9.5);
});
test("all six living characters attack once from one pre-tick snapshot, with exact decimal HP", () => {
  const original = createPvp(teams);
  const { state, hits } = resolveAutoRound(original);
  assert.equal(hits.length, 6);
  assert.equal(new Set(hits.map((h) => h.actor)).size, 6);
  assert.equal(original.teams[0][0].hp, 80);
  assert.equal(state.round, 2);
  assert.equal(
    state.teams.flat().reduce((n, c) => n + c.hp, 0),
    original.teams.flat().reduce((n, c) => n + c.hp, 0) -
      hits.reduce((n, h) => n + h.damage, 0),
  );
});
test("server clock catch-up is idempotent and independent of polling frequency", () => {
  const s = createPvp(teams, "seed");
  assert.equal(advancePvp(s, PVP_TICK_MS - 1).state.round, 1);
  const early = advancePvp(s, PVP_TICK_MS * 3).state;
  assert.deepEqual(advancePvp(early, PVP_TICK_MS * 3).state, early);
  assert.deepEqual(
    advancePvp(early, PVP_TICK_MS * 5).state,
    advancePvp(s, PVP_TICK_MS * 5).state,
  );
});
test("actual unequal teams produce a winner rather than a forced draw; fallen characters cannot attack", () => {
  const start = createPvp(
    [
      team("a", ["doge", "pikachu", "almarts27-hamster-boss"]),
      team("b", ["piyomon", "nyan-cat", "chill-guy"]),
    ],
    "winner-test",
  );
  const end = advancePvp(start, PVP_DURATION_MS);
  assert.equal(end.state.phase, "won");
  assert.equal(end.state.winner, 0);
  const next = resolveAutoRound(end.state);
  assert.equal(next.hits.length, 0);
  assert.ok(end.state.teams.flat().every((c) => c.hp >= 0));
});
test("90 seconds without a winner returns a draw; no combat continues after deadline", () => {
  const s = createPvp(teams);
  s.teams.forEach((t) => t.forEach((c) => (c.atk = 0)));
  const end = advancePvp(s, 90000).state;
  assert.equal(end.phase, "draw");
  assert.equal(end.winner, null);
  assert.deepEqual(advancePvp(end, 120000).state, end);
});
test("HP never accumulates floating-point residue and duplicate instance IDs are rejected", () => {
  let s = createPvp(teams);
  for (let i = 0; i < 20 && s.phase === "choosing"; i++)
    s = resolveAutoRound(s).state;
  assert.ok(
    s.teams
      .flat()
      .every((c) => Math.abs(c.hp * 10 - Math.round(c.hp * 10)) < 1e-9),
  );
  assert.throws(() => createPvp([teams[0], teams[0]]));
  assert.equal(normalizeUsername(" Hunter_27 "), "hunter_27");
});

test("identical rosters can produce either winner; a draw is never forced by mirrored targeting", () => {
  const roster: PvpCard["cardId"][] = ["gengar", "doge", "piyomon"];
  const outcomes = new Set(
    Array.from(
      { length: 100 },
      (_, i) =>
        advancePvp(
          createPvp([team("a", roster), team("b", roster)], String(i)),
          90000,
        ).state.winner,
    ),
  );
  assert.ok(outcomes.has(0));
  assert.ok(outcomes.has(1));
});

test("lethal strikes remain simultaneous: both surviving fighters attack before a double knockout refund", () => {
  const state = createPvp(teams, "double-ko");
  state.teams.forEach((team) =>
    team.forEach((card, i) => {
      card.hp = i === 2 ? 3 : 0;
      card.atk = 5;
    }),
  );
  const result = resolveAutoRound(state);
  assert.equal(result.hits.length, 2);
  assert.equal(result.state.phase, "draw");
  assert.equal(result.state.winner, null);
  assert.ok(result.state.teams.flat().every((c) => c.hp === 0));
});
