"use client";
import { useSyncExternalStore } from "react";
import CollectionScreen from "./collection-screen";
import {
  collectionSnapshot,
  readCollection,
  subscribeCollection,
} from "@/lib/reveal-collection";
export default function CollectionPage() {
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
      isLoading={false}
    />
  );
}
