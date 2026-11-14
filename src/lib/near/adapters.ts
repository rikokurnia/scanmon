"use client";
import type {
  MarketAdapter,
  MarketSnapshot,
} from "@/app/market/market-interface";
import { createKobanMarketAdapter } from "@/app/market/koban-market-adapter";
import type {
  BattleAdapter,
  BattleSnapshot,
} from "@/app/battle/battle-interface";
import {
  gameSnapshot,
  subscribeGame,
  trade,
  refreshGame,
  saveTeam,
  startRaid,
  attack,
  claimBossReward,
} from "./game-store";
import { GAME_ID, displayUnits } from "./config";
import { view } from "./rpc";
export function createChainMarketAdapter(): MarketAdapter {
  const merchant = createKobanMarketAdapter();
  let source: ReturnType<typeof gameSnapshot> | null = null;
  let snapshot: MarketSnapshot = { catalog: [], ownedCards: [], loading: true };
  return {
    getSnapshot() {
      const state = gameSnapshot();
      if (state === source) return snapshot;
      source = state;
      snapshot = {
        catalog: state.shop,
        ownedCards: (state.player?.cards ?? []).map((c) => ({
          instanceId: c.token_id,
          cardId: c.card_id,
          sellEligible: !state.player?.locked_ids.includes(c.token_id),
          transferLocked: state.player?.locked_ids.includes(c.token_id),
          ineligibleReason: state.player?.locked_ids.includes(c.token_id)
            ? "In active raid"
            : undefined,
        })),
        loading: state.loading,
        error: state.error,
      };
      return snapshot;
    },
    subscribe: subscribeGame,
    async negotiate(request) {
      const quotePromise = view<{
        amount: string;
        stock: number;
        available: boolean;
        reason: string;
      }>(GAME_ID, "quote", {
        card_id: request.cardId,
        direction: request.direction,
      }).catch(() => null);

      let response;
      try {
        response = await merchant.negotiate(request);
      } catch (err) {
        if (request.signal.aborted) {
          throw err;
        }
        response = {
          reply: "Hold on, pal—my counter ledger is catching its breath. Try again!",
          offer: null,
          status: "error" as const,
          offerIntent: "none" as const,
          errorMessage:
            err instanceof Error ? err.message : "Merchant reply failed.",
        };
      }

      if (request.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const quote = await quotePromise;

      // General questions / small talk stay conversational with no forced offer.
      if (response.offerIntent === "none" || (!response.offer && response.offerIntent !== "active")) {
        return {
          ...response,
          offer: null,
        };
      }

      if (response.offerIntent === "declined" || response.status === "declined") {
        return {
          ...response,
          offer: null,
          status: "declined",
          offerIntent: "declined",
        };
      }

      if (quote && !quote.available) {
        return {
          reply:
            request.direction === "buy"
              ? "Sold out for now. Check back after another hunter trades!"
              : "Buying paused: my USDC budget is reserved or exhausted.",
          offer: null,
          status: "declined",
          offerIntent: "declined",
        };
      }

      // Preserve Koban's real-time LLM reply while anchoring official settlement
      // to the contract's exact USDC price when a deal is active.
      const contractAmount = quote
        ? BigInt(quote.amount || "0") % BigInt(10_000) === BigInt(0)
          ? displayUnits(quote.amount, 6, 2)
          : displayUnits(quote.amount, 6, 6).replace(/\.?0+$/, "")
        : response.offer?.usdcAmount;

      if (!contractAmount) {
        return {
          ...response,
          offer: null,
        };
      }

      return {
        ...response,
        status: "ok",
        offerIntent: "active",
        offer: {
          offerId: response.offer?.offerId ?? crypto.randomUUID(),
          cardId: request.cardId,
          direction: request.direction,
          instanceId: request.instanceId,
          usdcAmount: contractAmount,
          expiresAt: Date.now() + 120_000,
          status: "active",
        },
      };
    },
    async acceptOffer(request) {
      const tx = await trade(
        request.direction,
        request.cardId,
        request.usdcAmount,
        request.instanceId,
      );
      return {
        success: true,
        status: "completed",
        txHash: tx.hash,
        message: "USDC and card settlement confirmed on NEAR.",
      };
    },
    refreshState: refreshGame,
  };
}
export function createChainBattleAdapter(): BattleAdapter {
  let source: ReturnType<typeof gameSnapshot> | null = null;
  let snapshot: BattleSnapshot = {
    ownedCards: [],
    savedTeamIds: [],
    minimumTeamSize: 3,
    loading: true,
    battle: null,
  };
  return {
    getSnapshot() {
      const state = gameSnapshot();
      if (state === source) return snapshot;
      source = state;
      snapshot = {
        ownedCards: (state.player?.cards ?? []).map((c) => ({
          instanceId: c.token_id,
          cardId: c.card_id,
          raidEligible: true,
        })),
        savedTeamIds: state.team,
        minimumTeamSize: 3,
        loading: state.loading,
        error: state.error ?? undefined,
        battle: state.raidSession
          ? {
              ...state.raidSession.battle,
              reward:
                state.raidSession.battle.phase === "won" &&
                state.player?.boss_reward_token
                  ? {
                      status: "granted",
                      text: "Boss NFT claimed · open Collection to view your vault",
                    }
                  : undefined,
            }
          : null,
      };
      return snapshot;
    },
    subscribe: subscribeGame,
    saveTeam,
    startRaid,
    attack,
    claimReward: async () => {
      await claimBossReward();
    },
  };
}
