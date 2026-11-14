"use client";
import { useSyncExternalStore } from "react";
import { useGame } from "@/lib/near/game-store";
import type { ChainTx } from "@/lib/near/types";
import type { ScanResult } from "@/lib/scan-result";
import CollectionScreen from "./collection-screen";
import {
  collectionSnapshot,
  readCollection,
  subscribeCollection,
} from "@/lib/reveal-collection";

function findCardTxHash(result: ScanResult, history: ChainTx[]): string | undefined {
  const isBossCard =
    result.barcode.startsWith("boss:") ||
    result.cardId === "almarts27-hamster-boss";

  for (const tx of history) {
    if (tx.status !== "success") continue;
    if (tx.kind === "mint" && tx.detail?.includes(result.barcode)) {
      return tx.hash;
    }
    if (isBossCard && tx.kind === "boss") {
      return tx.hash;
    }
  }
  return undefined;
}

export default function CollectionPage() {
  const game = useGame();
  const snapshot = useSyncExternalStore(
    subscribeCollection,
    collectionSnapshot,
    () => "[]",
  );
  return (
    <CollectionScreen
      cards={readCollection(snapshot).map((result) => ({
        instanceId: result.id,
        cardId: result.cardId,
        txHash: findCardTxHash(result, game.history),
      }))}
      isLoading={game.loading}
    />
  );
}
