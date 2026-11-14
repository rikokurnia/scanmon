import {
  CARD_CATALOG,
  type CardAssetEntry,
  type CardId,
  resolveCardAsset,
} from "../collection/card-catalog";

export type TradeDirection = "buy" | "sell";

/**
 * Authoritative availability for a standard card in Koban's shop.
 * When absent from MarketSnapshot.catalog, availability is treated as unprovided
 * rather than inventing stock counts.
 */
export interface MarketCatalogEntry {
  cardId: CardId;
  inStock?: boolean;
  stockCount?: number | null;
}

/**
 * Authoritative owned-card record from shared player ownership state.
 * Boss reward cards and locked/listed cards are never eligible for sale.
 */
export interface MarketOwnedCard {
  instanceId: string;
  cardId: CardId | string;
  sellEligible?: boolean;
  lockedByListing?: boolean;
  transferLocked?: boolean;
  ineligibleReason?: string;
}

export interface MerchantOffer {
  offerId: string;
  cardId: CardId;
  direction: TradeDirection;
  instanceId?: string;
  usdcAmount: string;
  expiresAt?: number;
  expiresAtSec?: number;
  signature?: number[];
  status: "active" | "declined" | "expired";
}

export interface NegotiateRequest {
  sessionId: string;
  cardId: CardId;
  direction: TradeDirection;
  instanceId?: string;
  message: string;
  signal: AbortSignal;
  onStreamText?: (partialReply: string) => void;
}

export interface NegotiateResponse {
  reply: string;
  offer: MerchantOffer | null;
  status?: "ok" | "declined" | "expired" | "error";
  offerIntent?: "active" | "declined" | "none";
  errorMessage?: string;
}

export interface AcceptOfferRequest {
  offerId: string;
  cardId: CardId;
  direction: TradeDirection;
  instanceId?: string;
  usdcAmount: string;
  expiresAtSec?: number;
  signature?: number[];
}

export interface AcceptOfferResult {
  success: boolean;
  status: "completed" | "expired" | "failed";
  message?: string;
  txHash?: string;
}

export interface MarketSnapshot {
  catalog: readonly MarketCatalogEntry[];
  ownedCards: readonly MarketOwnedCard[];
  loading: boolean;
  error?: string | null;
}

/**
 * Install from a shared client provider once catalog, ownership, merchant LLM,
 * and NEAR USDC settlement interfaces are wired.
 */
export interface MarketAdapter {
  getSnapshot(): MarketSnapshot;
  subscribe(listener: () => void): () => void;
  negotiate(request: NegotiateRequest): Promise<NegotiateResponse>;
  acceptOffer(request: AcceptOfferRequest): Promise<AcceptOfferResult>;
  refreshState?(): Promise<void>;
}

export interface ResolvedBuyCard {
  asset: CardAssetEntry;
  inStock: boolean | null;
  stockCount: number | null;
  outOfStock: boolean;
}

export interface ResolvedSellCard {
  key: string;
  instanceId: string;
  asset: CardAssetEntry;
  eligible: boolean;
  ineligibleReason?: string;
}

export function isBossCard(cardId: string): boolean {
  const asset = resolveCardAsset(cardId);
  return asset?.variant === "boss" || cardId === "almarts27-hamster-boss";
}

/**
 * Canonical standard catalog cards for Buy (boss reward cards excluded).
 */
export function getStandardCatalogCards(): CardAssetEntry[] {
  return Object.values(CARD_CATALOG).filter(
    (entry) => entry.variant !== "boss",
  );
}

/**
 * Merge canonical card artwork with authoritative shop availability.
 * Boss cards are always excluded.
 */
export function resolveBuyCards(
  catalog: readonly MarketCatalogEntry[],
): ResolvedBuyCard[] {
  const byId = new Map<CardId, MarketCatalogEntry>();
  for (const item of catalog) {
    if (!isBossCard(item.cardId)) {
      byId.set(item.cardId, item);
    }
  }

  return getStandardCatalogCards().map((asset) => {
    const entry = byId.get(asset.id);
    if (!entry) {
      return {
        asset,
        inStock: null,
        stockCount: null,
        outOfStock: false,
      };
    }

    const stockCount =
      typeof entry.stockCount === "number" ? entry.stockCount : null;
    const outOfStock =
      entry.inStock === false || (stockCount !== null && stockCount <= 0);
    const inStock = outOfStock
      ? false
      : entry.inStock === true || (stockCount !== null && stockCount > 0)
        ? true
        : null;

    return {
      asset,
      inStock,
      stockCount,
      outOfStock,
    };
  });
}

export function isSellEligible(card: MarketOwnedCard): boolean {
  const asset = resolveCardAsset(card.cardId);
  if (!asset || asset.variant === "boss") return false;
  if (card.lockedByListing || card.transferLocked) return false;
  if (card.sellEligible === false) return false;
  return true;
}

/**
 * Resolve player-owned cards for Sell.
 * Excludes boss reward cards completely and preserves lock state on standard cards.
 */
export function resolveSellCards(ownedCards: readonly MarketOwnedCard[]): {
  eligible: ResolvedSellCard[];
  locked: ResolvedSellCard[];
} {
  const eligible: ResolvedSellCard[] = [];
  const locked: ResolvedSellCard[] = [];

  ownedCards.forEach((card, idx) => {
    const asset = resolveCardAsset(card.cardId);
    if (!asset || asset.variant === "boss") return;

    const canSell = isSellEligible(card);
    const reason =
      card.ineligibleReason ??
      (card.lockedByListing
        ? "Listed"
        : card.transferLocked
          ? "Transfer locked"
          : canSell
            ? undefined
            : "Unavailable");

    const resolved: ResolvedSellCard = {
      key: card.instanceId || `${asset.id}-${idx}`,
      instanceId: card.instanceId,
      asset,
      eligible: canSell,
      ineligibleReason: reason,
    };

    if (canSell) {
      eligible.push(resolved);
    } else {
      locked.push(resolved);
    }
  });

  return { eligible, locked };
}

export function parseUsdcAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export function formatUsdcAmount(raw: string): string | null {
  const num = parseUsdcAmount(raw);
  if (num === null) return null;
  return num.toFixed(2);
}

/**
 * Ensure a merchant offer strictly matches the active card, direction,
 * instance (for Sell), positive USDC amount, active status, and expiry.
 */
export function isValidOfferForContext(
  offer: MerchantOffer | null | undefined,
  context: {
    cardId: CardId;
    direction: TradeDirection;
    instanceId?: string;
    now?: number;
  },
): offer is MerchantOffer {
  if (!offer) return false;
  if (offer.status !== "active") return false;
  if (isBossCard(offer.cardId)) return false;
  if (offer.cardId !== context.cardId) return false;
  if (offer.direction !== context.direction) return false;
  if (
    context.direction === "sell" &&
    context.instanceId &&
    offer.instanceId &&
    offer.instanceId !== context.instanceId
  ) {
    return false;
  }
  if (parseUsdcAmount(offer.usdcAmount) === null) return false;
  const now = context.now ?? Date.now();
  if (typeof offer.expiresAt === "number" && offer.expiresAt <= now) {
    return false;
  }
  return true;
}
