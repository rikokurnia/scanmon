"use client";

import {
  collectionSnapshot,
  readCollection,
  subscribeCollection,
} from "@/lib/reveal-collection";
import type {
  AcceptOfferResult,
  MarketAdapter,
  MarketOwnedCard,
  MarketSnapshot,
  NegotiateRequest,
  NegotiateResponse,
} from "./market-interface";

interface ChatTurn {
  role: "user" | "koban";
  text: string;
}

function toMarketOwnedCards(raw: string): readonly MarketOwnedCard[] {
  return readCollection(raw).map((result) => ({
    instanceId: result.id,
    cardId: result.cardId,
    sellEligible: true,
  }));
}

/**
 * Default client adapter connecting Market UI to the real-time server LLM route
 * (`/api/market/negotiate`) and reading live player-owned cards from the shared
 * Scan/Collection store (`scanmon:collection:v1`). A higher-level wallet/chain
 * provider can still override via `connectMarketAdapter`.
 */
export function createKobanMarketAdapter(): MarketAdapter {
  let cachedRaw = typeof window === "undefined" ? "[]" : collectionSnapshot();
  let cachedSnapshot: MarketSnapshot = {
    catalog: [],
    ownedCards: toMarketOwnedCards(cachedRaw),
    loading: false,
    error: null,
  };

  const listeners = new Set<() => void>();
  const histories = new Map<string, ChatTurn[]>();
  let unsubCollection: (() => void) | undefined;

  const syncFromCollection = () => {
    const nextRaw = typeof window === "undefined" ? "[]" : collectionSnapshot();
    if (nextRaw === cachedRaw) return false;
    cachedRaw = nextRaw;
    cachedSnapshot = {
      ...cachedSnapshot,
      ownedCards: toMarketOwnedCards(nextRaw),
    };
    return true;
  };

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot() {
      syncFromCollection();
      return cachedSnapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") {
        unsubCollection = subscribeCollection(() => {
          if (syncFromCollection()) {
            notify();
          }
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubCollection?.();
          unsubCollection = undefined;
        }
      };
    },
    async refreshState() {
      if (syncFromCollection()) {
        notify();
      }
    },
    async negotiate(request: NegotiateRequest): Promise<NegotiateResponse> {
      const sessionKey = `${request.cardId}:${request.direction}:${request.instanceId ?? ""}`;
      const history = histories.get(sessionKey) ?? [];

      const response = await fetch("/api/market/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: request.cardId,
          direction: request.direction,
          instanceId: request.instanceId,
          message: request.message,
          history,
        }),
        signal: request.signal,
      });

      if (!response.ok) {
        return {
          reply: "Shop counter is busy right now.",
          offer: null,
          status: "error",
          errorMessage: `Merchant error (${response.status}).`,
        };
      }

      if (!response.body) {
        const json = (await response.json()) as NegotiateResponse;
        return json;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: NegotiateResponse = {
        reply: "",
        offer: null,
        status: "ok",
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as {
              type: "delta" | "done";
              text?: string;
              reply?: string;
              offer?: NegotiateResponse["offer"];
              status?: NegotiateResponse["status"];
              offerIntent?: NegotiateResponse["offerIntent"];
              errorMessage?: string;
            };

            if (event.type === "delta" && typeof event.text === "string") {
              request.onStreamText?.(event.text);
            } else if (event.type === "done") {
              finalResult = {
                reply: event.reply ?? "",
                offer: event.offer ?? null,
                status: event.status ?? "ok",
                offerIntent: event.offerIntent,
                errorMessage: event.errorMessage,
              };
            }
          } catch {
            // Ignore partial NDJSON line
          }
        }
      }

      if (finalResult.status !== "error" && finalResult.reply) {
        histories.set(sessionKey, [
          ...history.slice(-8),
          { role: "user", text: request.message },
          { role: "koban", text: finalResult.reply },
        ]);
      }

      return finalResult;
    },
    async acceptOffer(): Promise<AcceptOfferResult> {
      return {
        success: false,
        status: "failed",
        message: "Wallet settlement isn't connected yet.",
      };
    },
  };
}
