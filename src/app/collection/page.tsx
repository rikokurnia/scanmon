import CollectionScreen from "./collection-screen";
import type { OwnedCollectionCard } from "./card-catalog";

/**
 * Ownership state is not yet present in the shared frontend store.
 * When available, pass the player's owned cards into CollectionScreen.
 */
const EMPTY_OWNED_COLLECTION: OwnedCollectionCard[] = [];

export default function CollectionPage() {
  return <CollectionScreen cards={EMPTY_OWNED_COLLECTION} isLoading={false} />;
}
