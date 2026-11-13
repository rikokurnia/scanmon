"use client";
import { useSyncExternalStore } from "react";
import { useGame } from "@/lib/near/game-store";
import CollectionScreen from "./collection-screen";
import {
  collectionSnapshot,
  readCollection,
  subscribeCollection,
} from "@/lib/reveal-collection";
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
      }))}
      isLoading={game.loading}
    />
  );
}
