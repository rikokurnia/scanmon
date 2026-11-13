import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  eligible,
  toggleTeam,
  teamIssue,
  type BattleOwnedCard,
} from "./battle-interface";
const cards: BattleOwnedCard[] = ["a", "b", "c", "d"].map((instanceId) => ({
  instanceId,
  cardId: "pikachu",
  raidEligible: true,
}));
test("instance IDs allow distinct copies, reject repeated copies and preserve a full team", () => {
  let ids: string[] = [];
  for (const card of cards) ids = toggleTeam(ids, card);
  assert.deepEqual(ids, ["a", "b", "c"]);
  assert.deepEqual(toggleTeam(ids, cards[1]), ["a", "c"]);
  assert.equal(teamIssue(ids, cards), null);
  assert.ok(teamIssue(["a", "a", "b"], cards));
});
test("active listing locks and removed ownership invalidate a saved raid team", () => {
  const listed = { ...cards[0], lockedByListing: true };
  assert.equal(eligible(listed), false);
  assert.deepEqual(toggleTeam([], listed), []);
  assert.ok(teamIssue(["a", "b", "c"], [listed, ...cards.slice(1)]));
  assert.ok(teamIssue(["a", "b", "c"], cards.slice(1)));
  assert.ok(teamIssue(["a", "b"], cards));
  assert.equal(teamIssue(["a"], cards, 1), null);
});
