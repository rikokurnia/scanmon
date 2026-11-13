"use client";
import { useState } from "react";
import { CARD_CATALOG } from "@/app/collection/card-catalog";
import {
  useGame,
  listCard,
  cancelListing,
  buyListing,
} from "@/lib/near/game-store";
import { displayUnits } from "@/lib/near/config";
export default function PlayerMarket() {
  const game = useGame();
  const [token, setToken] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cards = (game.player?.cards ?? []).filter(
    (c) =>
      c.card_id !== "almarts27-hamster-boss" &&
      !game.player?.locked_ids.includes(c.token_id),
  );
  async function perform(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setToken("");
      setPrice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="player-market" aria-label="Player marketplace">
      <h2>Hunter’s market</h2>
      <p>
        Trade playable cards with other hunters. Listed cards stay in escrow
        until bought or cancelled.
      </p>
      {game.accountId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(() => listCard(token, price));
          }}
        >
          <label htmlFor="list-card">Your card</label>
          <select
            id="list-card"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          >
            <option value="">Choose an owned card</option>
            {cards.map((c) => (
              <option value={c.token_id} key={c.token_id}>
                {CARD_CATALOG[c.card_id].name} · {c.token_id}
              </option>
            ))}
          </select>
          <label htmlFor="list-price">Price in USDC</label>
          <input
            id="list-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 3.50"
            pattern="[0-9]+(\.[0-9]{1,6})?"
            required
          />
          <button
            className="chain-primary"
            disabled={busy || !cards.length}
            type="submit"
          >
            List card on NEAR
          </button>
        </form>
      ) : (
        <p>Connect in Settings to list or buy a card.</p>
      )}
      {!game.listings.length ? (
        <p>No sales listings yet. Set a price to start a trade.</p>
      ) : (
        <ul className="player-listings">
          {game.listings.map(({ listing, card }) => (
            <li key={listing.id}>
              <h3>{CARD_CATALOG[card.card_id].name}</h3>
              <p>{displayUnits(listing.price, 6, 6)} USDC</p>
              <small>Seller: {listing.seller}</small>
              <button
                className="chain-secondary"
                disabled={busy || !game.accountId}
                onClick={() =>
                  void perform(() =>
                    listing.seller === game.accountId
                      ? cancelListing(listing.id)
                      : buyListing(listing.id, listing.price),
                  )
                }
              >
                {listing.seller === game.accountId
                  ? "Cancel listing"
                  : "Buy card"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p>
        Confirmed player sales credit USDC to your account in the contract.
        Withdraw it from Settings.
      </p>
      {error && (
        <p className="chain-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
