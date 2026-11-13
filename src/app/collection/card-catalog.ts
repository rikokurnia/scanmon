export type CardId =
  | "nyan-cat"
  | "pikachu"
  | "doge"
  | "gengar"
  | "pepe"
  | "veemon"
  | "piyomon"
  | "chill-guy"
  | "almarts27-hamster-boss";

export type CardFrameVariant = "blue" | "yellow" | "boss";

export interface CardAssetEntry {
  id: CardId;
  name: string;
  cardImageSrc: string;
  width: number;
  height: number;
  variant: CardFrameVariant;
}

/**
 * Canonical card artwork catalog for scanMon.
 * Describes what the app can render; does not grant ownership.
 */
export const CARD_CATALOG: Record<CardId, CardAssetEntry> = {
  "nyan-cat": {
    id: "nyan-cat",
    name: "Nyan Cat",
    cardImageSrc: "/assets/cards/scanmon-nyan-cat-blue.png",
    width: 1000,
    height: 1400,
    variant: "blue",
  },
  pikachu: {
    id: "pikachu",
    name: "Pikachu",
    cardImageSrc: "/assets/cards/scanmon-pikachu-yellow.jpeg",
    width: 1728,
    height: 2420,
    variant: "yellow",
  },
  doge: {
    id: "doge",
    name: "Doge",
    cardImageSrc: "/assets/cards/scanmon-doge-yellow-revised.png",
    width: 1000,
    height: 1400,
    variant: "yellow",
  },
  gengar: {
    id: "gengar",
    name: "Gengar",
    cardImageSrc: "/assets/cards/scanmon-gengar-blue.png",
    width: 1000,
    height: 1400,
    variant: "blue",
  },
  pepe: {
    id: "pepe",
    name: "Pepe",
    cardImageSrc: "/assets/cards/scanmon-pepe-yellow.png",
    width: 1000,
    height: 1400,
    variant: "yellow",
  },
  veemon: {
    id: "veemon",
    name: "Veemon",
    cardImageSrc: "/assets/cards/scanmon-veemon-yellow.png",
    width: 1000,
    height: 1400,
    variant: "yellow",
  },
  piyomon: {
    id: "piyomon",
    name: "Piyomon",
    cardImageSrc: "/assets/cards/scanmon-piyomon-blue.png",
    width: 1000,
    height: 1400,
    variant: "blue",
  },
  "chill-guy": {
    id: "chill-guy",
    name: "Chill Guy",
    cardImageSrc: "/assets/cards/scanmon-chill-guy-blue.png",
    width: 1000,
    height: 1400,
    variant: "blue",
  },
  "almarts27-hamster-boss": {
    id: "almarts27-hamster-boss",
    name: "Almarts27 Hamster",
    cardImageSrc: "/assets/cards/scanmon-almarts27-hamster-boss.png",
    width: 1000,
    height: 1400,
    variant: "boss",
  },
};

export function isKnownCardId(value: string): value is CardId {
  return Object.prototype.hasOwnProperty.call(CARD_CATALOG, value);
}

/**
 * Resolve a canonical card ID to its finished card artwork entry.
 * Returns null if the card ID is not in the catalog.
 */
export function resolveCardAsset(cardId: string): CardAssetEntry | null {
  if (!isKnownCardId(cardId)) return null;
  return CARD_CATALOG[cardId];
}

export interface OwnedCollectionCard {
  /** Unique instance ID for duplicate copies of the same species, or cardId when 1:1 */
  instanceId?: string;
  /** Canonical card ID matching CARD_CATALOG */
  cardId: CardId | string;
}

export interface CollectionScreenProps {
  /** Owned cards from the player's collection state */
  cards: OwnedCollectionCard[];
  /** True while asynchronous collection ownership is loading */
  isLoading?: boolean;
  /** Optional error message if loading the collection failed */
  error?: string | null;
  /** Optional canonical card ID or instanceId to focus initially */
  initialCardId?: string;
}
