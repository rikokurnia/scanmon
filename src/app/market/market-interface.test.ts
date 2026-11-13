import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  formatUsdcAmount,
  getStandardCatalogCards,
  isBossCard,
  isSellEligible,
  isValidOfferForContext,
  resolveBuyCards,
  resolveSellCards,
  type MarketOwnedCard,
  type MerchantOffer,
} from "./market-interface";

test("boss reward card is excluded from standard Buy catalog and Sell flow", () => {
  assert.equal(isBossCard("almarts27-hamster-boss"), true);
  assert.equal(isBossCard("nyan-cat"), false);

  const standard = getStandardCatalogCards();
  assert.equal(standard.length, 8);
  assert.equal(
    standard.some((c) => c.id === "almarts27-hamster-boss"),
    false,
  );

  const buyCards = resolveBuyCards([
    { cardId: "almarts27-hamster-boss" as never, inStock: true, stockCount: 5 },
    { cardId: "nyan-cat", inStock: false, stockCount: 0 },
  ]);
  assert.equal(buyCards.length, 8);
  assert.equal(
    buyCards.some((c) => c.asset.id === "almarts27-hamster-boss"),
    false,
  );
  const nyan = buyCards.find((c) => c.asset.id === "nyan-cat");
  assert.ok(nyan);
  assert.equal(nyan.outOfStock, true);
  assert.equal(nyan.inStock, false);

  const pikachu = buyCards.find((c) => c.asset.id === "pikachu");
  assert.ok(pikachu);
  assert.equal(pikachu.inStock, null);
  assert.equal(pikachu.stockCount, null);
  assert.equal(pikachu.outOfStock, false);
});

test("Sell excludes boss cards and respects listing and transfer locks", () => {
  const owned: MarketOwnedCard[] = [
    { instanceId: "inst-boss", cardId: "almarts27-hamster-boss" },
    { instanceId: "inst-nyan-1", cardId: "nyan-cat" },
    { instanceId: "inst-nyan-2", cardId: "nyan-cat", lockedByListing: true },
    { instanceId: "inst-doge", cardId: "doge", transferLocked: true },
    {
      instanceId: "inst-pepe",
      cardId: "pepe",
      sellEligible: false,
      ineligibleReason: "In raid",
    },
    { instanceId: "inst-unknown", cardId: "not-a-card" },
  ];

  assert.equal(isSellEligible(owned[0]), false);
  assert.equal(isSellEligible(owned[1]), true);
  assert.equal(isSellEligible(owned[2]), false);
  assert.equal(isSellEligible(owned[3]), false);
  assert.equal(isSellEligible(owned[4]), false);
  assert.equal(isSellEligible(owned[5]), false);

  const { eligible, locked } = resolveSellCards(owned);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].instanceId, "inst-nyan-1");
  assert.equal(eligible[0].asset.id, "nyan-cat");

  assert.equal(locked.length, 3);
  assert.equal(
    locked.some((c) => c.asset.id === "almarts27-hamster-boss"),
    false,
  );
  assert.equal(locked[0].ineligibleReason, "Listed");
  assert.equal(locked[1].ineligibleReason, "Transfer locked");
  assert.equal(locked[2].ineligibleReason, "In raid");
});

test("isValidOfferForContext rejects stale, wrong-card, wrong-direction, expired, and boss offers", () => {
  const baseOffer: MerchantOffer = {
    offerId: "offer-1",
    cardId: "nyan-cat",
    direction: "buy",
    usdcAmount: "3.5",
    expiresAt: 2_000,
    status: "active",
  };

  assert.equal(
    isValidOfferForContext(baseOffer, {
      cardId: "nyan-cat",
      direction: "buy",
      now: 1_000,
    }),
    true,
  );
  assert.equal(formatUsdcAmount(baseOffer.usdcAmount), "3.50");

  assert.equal(
    isValidOfferForContext(baseOffer, {
      cardId: "pikachu",
      direction: "buy",
      now: 1_000,
    }),
    false,
  );
  assert.equal(
    isValidOfferForContext(baseOffer, {
      cardId: "nyan-cat",
      direction: "sell",
      now: 1_000,
    }),
    false,
  );
  assert.equal(
    isValidOfferForContext(baseOffer, {
      cardId: "nyan-cat",
      direction: "buy",
      now: 2_000,
    }),
    false,
  );
  assert.equal(
    isValidOfferForContext(
      { ...baseOffer, status: "declined" },
      { cardId: "nyan-cat", direction: "buy", now: 1_000 },
    ),
    false,
  );
  assert.equal(
    isValidOfferForContext(
      { ...baseOffer, usdcAmount: "0" },
      { cardId: "nyan-cat", direction: "buy", now: 1_000 },
    ),
    false,
  );
  assert.equal(
    isValidOfferForContext(
      {
        ...baseOffer,
        direction: "sell",
        instanceId: "inst-1",
      },
      {
        cardId: "nyan-cat",
        direction: "sell",
        instanceId: "inst-2",
        now: 1_000,
      },
    ),
    false,
  );
});
