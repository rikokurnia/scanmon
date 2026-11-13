import { test } from "node:test";
import assert from "node:assert/strict";
import { newRaid, raidTurn, restoreRaid, attackArt } from "./raid-engine";
import { CARD_CATALOG } from "../collection/card-catalog";
import { existsSync } from "node:fs";
const team = [
  { instanceId: "p", cardId: "pikachu" as const },
  { instanceId: "v", cardId: "veemon" as const },
  { instanceId: "g", cardId: "gengar" as const },
];
test("off-chain turns match the contract golden transcript, including heavy damage and no counter on lethal hit", () => {
  let session = newRaid(team, "test");
  for (const id of ["p", "p", "p", "v", "v"])
    session = raidTurn(session, { instance_id: id, skill_id: "strike" });
  assert.equal(session.battle.round, 6);
  assert.equal(session.battle.bossHp, 0);
  assert.equal(session.battle.phase, "won");
  assert.deepEqual(
    session.battle.team.map((c) => c.hp),
    [20, 95, 120],
  );
  assert.equal(session.actions.length, 5);
  assert.equal(session.battle.reward, undefined);
  assert.throws(() =>
    raidTurn(session, { instance_id: "g", skill_id: "strike" }),
  );
  const raw = JSON.stringify({
    ...session,
    battle: { ...session.battle, bossHp: 999, phase: "lost" },
  });
  assert.deepEqual(restoreRaid(raw), session);
});
test("dead actors, foreign actors, duplicate slots, invalid skills and corrupt persistence are rejected", () => {
  let session = newRaid(team, "test");
  for (let i = 0; i < 4; i++)
    session = raidTurn(session, { instance_id: "p", skill_id: "strike" });
  assert.equal(session.battle.team[0].hp, 0);
  assert.throws(() =>
    raidTurn(session, { instance_id: "p", skill_id: "strike" }),
  );
  assert.throws(() => raidTurn(session, { instance_id: "v", skill_id: "win" }));
  assert.throws(() =>
    raidTurn(session, { instance_id: "foreign", skill_id: "strike" }),
  );
  assert.throws(() => newRaid([team[0], team[0], team[2]], "bad"));
  assert.equal(restoreRaid("bad-json"), null);
});
test("every collectible and boss resolves to its supplied attack art, plus both summon GIFs and shared contact hit", () => {
  for (const card of Object.values(CARD_CATALOG))
    assert.ok(existsSync(`public${attackArt(card.id)}`), card.id);
  for (const asset of [
    attackArt("boss"),
    "/assets/battle/summon-sky-drop.gif",
    "/assets/battle/summon-starfall.gif",
    "/assets/battle/universal-hit.png",
  ])
    assert.ok(existsSync(`public${asset}`));
});
