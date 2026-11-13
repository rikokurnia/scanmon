import {
  collectionSnapshot,
  readCollection,
  subscribeCollection,
} from "@/lib/reveal-collection";
import { isKnownCardId } from "../collection/card-catalog";
import type { MarketAdapter, MarketSnapshot } from "../market/market-interface";
import {
  teamIssue,
  type BattleAdapter,
  type BattleSnapshot,
} from "./battle-interface";

const TEAM_KEY = "scanmon:battle-team:v1";
const TEAM_EVENT = "scanmon:battle-team-changed";

function readTeam(raw: string): string[] {
  try {
    const ids: unknown = JSON.parse(raw);
    if (
      !Array.isArray(ids) ||
      ids.length > 3 ||
      ids.some((id) => typeof id !== "string") ||
      new Set(ids).size !== ids.length
    )
      return [];
    return ids;
  } catch {
    return [];
  }
}
function teamSnapshot() {
  try {
    return localStorage.getItem(TEAM_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** Reads the SAME owned instances as Scan/Collection/Market; never grants cards.
 * A connected Market adapter supersedes local ownership and supplies listing /
 * transfer locks. Raid results still require a real BattleAdapter override.
 */
export function createCollectionBattleAdapter(
  market?: MarketAdapter | null,
): BattleAdapter {
  let cachedCollection: string | undefined;
  let cachedTeam: string | undefined;
  let cachedMarket: MarketSnapshot | undefined;
  let snapshot: BattleSnapshot = {
    ownedCards: [],
    savedTeamIds: [],
    minimumTeamSize: 3,
    loading: false,
    battle: null,
  };
  function sync() {
    const raw = typeof window === "undefined" ? "[]" : collectionSnapshot();
    const team = typeof window === "undefined" ? "[]" : teamSnapshot();
    const marketState = market?.getSnapshot();
    if (
      raw === cachedCollection &&
      team === cachedTeam &&
      marketState === cachedMarket
    )
      return snapshot;
    cachedCollection = raw;
    cachedTeam = team;
    cachedMarket = marketState;
    const cards = marketState
      ? marketState.ownedCards
      : readCollection(raw).map((card) => ({
          instanceId: card.id,
          cardId: card.cardId,
        }));
    snapshot = {
      ownedCards: cards.flatMap((card) =>
        isKnownCardId(card.cardId)
          ? [
              {
                instanceId: card.instanceId,
                cardId: card.cardId,
                raidEligible: !(
                  "transferLocked" in card && card.transferLocked
                ),
                lockedByListing:
                  "lockedByListing" in card ? card.lockedByListing : false,
                ineligibleReason:
                  "ineligibleReason" in card
                    ? card.ineligibleReason
                    : undefined,
              },
            ]
          : [],
      ),
      savedTeamIds: readTeam(team),
      minimumTeamSize: 3,
      loading: marketState?.loading ?? false,
      error: marketState?.error ?? undefined,
      battle: null,
    };
    return snapshot;
  }
  return {
    getSnapshot: sync,
    subscribe(listener) {
      const collectionUnsub = subscribeCollection(listener);
      const marketUnsub = market?.subscribe(listener);
      window.addEventListener(TEAM_EVENT, listener);
      return () => {
        collectionUnsub();
        marketUnsub?.();
        window.removeEventListener(TEAM_EVENT, listener);
      };
    },
    async saveTeam(ids) {
      const current = sync();
      if (current.loading)
        throw new Error("Your cards are still loading. Try again.");
      if (current.error) throw new Error(current.error);
      const issue = teamIssue(ids, current.ownedCards, 0);
      if (issue) throw new Error(issue);
      // Storage errors reject the action; never show a save that did not persist.
      localStorage.setItem(TEAM_KEY, JSON.stringify(ids));
      window.dispatchEvent(new Event(TEAM_EVENT));
    },
    async startRaid(ids) {
      const current = sync();
      if (current.loading)
        throw new Error("Your cards are still loading. Try again.");
      if (current.error) throw new Error(current.error);
      const issue = teamIssue(ids, current.ownedCards, current.minimumTeamSize);
      if (issue) throw new Error(issue);
      // Open the arena with the real team. No combat state is fabricated.
    },
    async attack() {
      throw new Error("Raid service is not connected yet.");
    },
  };
}
