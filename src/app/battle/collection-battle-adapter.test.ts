import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { addRevealedCard } from "@/lib/reveal-collection";
import { resolveScanResult } from "@/lib/scan-result";
import { createCollectionBattleAdapter } from "./collection-battle-adapter";
import { eligible } from "./battle-interface";
import type { MarketAdapter, MarketSnapshot } from "../market/market-interface";

function browser(t: TestContext) {
  const data = new Map<string, string>();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  t.after(() => {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (oldStorage)
      Object.defineProperty(globalThis, "localStorage", oldStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  return data;
}

test("revealed cards share exact instance/art IDs; subscriptions update Battle and saved teams survive navigation/reload", async (t) => {
  browser(t);
  const adapter = createCollectionBattleAdapter();
  const empty = adapter.getSnapshot();
  assert.strictEqual(empty, adapter.getSnapshot());
  let changes = 0;
  const stop = adapter.subscribe(() => {
    changes++;
  });
  const card = resolveScanResult("4006381333931")!;
  addRevealedCard(card);
  assert.equal(changes, 1);
  assert.deepEqual(adapter.getSnapshot().ownedCards, [
    {
      instanceId: card.id,
      cardId: card.cardId,
      raidEligible: true,
      lockedByListing: false,
      ineligibleReason: undefined,
    },
  ]);
  await adapter.saveTeam([card.id]);
  assert.equal(changes, 2);
  assert.deepEqual(createCollectionBattleAdapter().getSnapshot().savedTeamIds, [
    card.id,
  ]);
  assert.equal(adapter.getSnapshot().battle, null);
  await assert.rejects(adapter.startRaid([card.id]), /Choose 3/);
  await assert.rejects(
    adapter.saveTeam([card.id, card.id]),
    /different owned cards/,
  );
  stop();
  await adapter.saveTeam([]);
  assert.equal(changes, 2);
});

test("authoritative Market locks, transfers and removal invalidate the same owned instance in Battle", async (t) => {
  browser(t);
  let marketState: MarketSnapshot = {
    catalog: [],
    ownedCards: [{ instanceId: "owned:1", cardId: "pikachu" }],
    loading: false,
  };
  const listeners = new Set<() => void>();
  const market: MarketAdapter = {
    getSnapshot: () => marketState,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    negotiate: async () => {
      throw Error("unused");
    },
    acceptOffer: async () => {
      throw Error("unused");
    },
  };
  const adapter = createCollectionBattleAdapter(market);
  let changed = 0;
  const stop = adapter.subscribe(() => {
    changed++;
  });
  await adapter.saveTeam(["owned:1"]);
  marketState = {
    ...marketState,
    ownedCards: [
      { instanceId: "owned:1", cardId: "pikachu", lockedByListing: true },
    ],
  };
  listeners.forEach((fn) => fn());
  assert.equal(changed, 2);
  assert.equal(eligible(adapter.getSnapshot().ownedCards[0]), false);
  await assert.rejects(adapter.saveTeam(["owned:1"]), /Market-listed/);
  marketState = {
    ...marketState,
    ownedCards: [
      { instanceId: "owned:1", cardId: "pikachu", transferLocked: true },
    ],
  };
  assert.equal(eligible(adapter.getSnapshot().ownedCards[0]), false);
  marketState = { ...marketState, ownedCards: [] };
  assert.equal(adapter.getSnapshot().ownedCards.length, 0);
  await assert.rejects(adapter.saveTeam(["owned:1"]), /unavailable/);
  assert.deepEqual(adapter.getSnapshot().savedTeamIds, ["owned:1"]);
  stop();
});

test("cross-tab events update team; corrupt saved teams and failed writes never create a false save", async (t) => {
  const data = browser(t);
  const adapter = createCollectionBattleAdapter();
  let changes = 0;
  const stop = adapter.subscribe(() => {
    changes++;
  });
  data.set("scanmon:battle-team:v1", '["previously-owned"]');
  window.dispatchEvent(new Event("storage"));
  assert.equal(changes, 1);
  assert.deepEqual(adapter.getSnapshot().savedTeamIds, ["previously-owned"]);
  data.set("scanmon:battle-team:v1", '["duplicate","duplicate"]');
  assert.deepEqual(adapter.getSnapshot().savedTeamIds, []);
  data.set("scanmon:battle-team:v1", "invalid-json");
  assert.deepEqual(adapter.getSnapshot().savedTeamIds, []);
  localStorage.setItem = () => {
    throw Error("Storage unavailable");
  };
  await assert.rejects(adapter.saveTeam([]), /Storage unavailable/);
  assert.equal(changes, 1);
  stop();
});
