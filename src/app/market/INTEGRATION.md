# Market frontend handoff

Route: `/market`.

Approved references:
- `random/scanmon-asets/layout-references/Koban market with twin Nyan cards.png` (Buy/Sell card picker)
- `random/scanmon-asets/layout-references/Nyan Cat offer on ScanMon Market.png` (Negotiation with Koban, without "Your offer" and with Koban's reply in the speech bubble above his head)
- `public/assets/market/koban-video.mp4` + `public/assets/market/koban-shop-still.png` (reduced-motion still & video poster)

## Live Koban LLM negotiation

By default, `/market` wires `createKobanMarketAdapter()` (`src/app/market/koban-market-adapter.ts`) to `POST /api/market/negotiate` (`src/app/api/market/negotiate/route.ts`):
- Streams real-time NDJSON (`delta` / `done`) responses from Google Gemini (`@google/genai`, `GEMINI_API_KEY`) with automatic streaming fallback to DeepSeek (`deepseek-chat`, `DEEPSEEK_API_KEY`) using server `.env` credentials.
- Answers both price offers/counteroffers and general questions about the selected card, trade flow, or scanMon shop (`offerIntent: "none"` keeps the speech bubble open without fabricating a USDC offer).
- Excludes boss reward card `almarts27-hamster-boss` from Buy, Sell, and `/api/market/negotiate`.

## Shared state and wallet hookup

From a shared client session provider above routes, call `connectMarketAdapter(adapter)` from `market-store.ts` and invoke the returned cleanup callback on unmount to override or compose the default Koban adapter. See `market-interface.ts` for full types.

### Missing inputs / actions outside this frontend pass
1. **Shop availability (`MarketSnapshot.catalog`)**: Supply `{ cardId, inStock, stockCount }` entries for standard cards. Boss card `almarts27-hamster-boss` is always excluded by `resolveBuyCards`. Any entry with `inStock: false` or `stockCount <= 0` stays visible with **Out of stock** and disables negotiation.
2. **Player ownership (`MarketSnapshot.ownedCards`)**: Supply `{ instanceId, cardId, sellEligible, lockedByListing, transferLocked, ineligibleReason }` from shared ownership state. Boss reward cards are always excluded from Sell; locked/listed cards cannot be negotiated; empty eligible inventory shows **No cards to sell**.
3. **Trade settlement (`MarketAdapter.acceptOffer` + `refreshState`)**: Default adapter returns `{ success: false, status: "failed", message: "Wallet settlement isn't connected yet." }` so no fake trade is ever shown. Connect NEAR/USDC settlement returning `{ success, status: "completed" | "expired" | "failed", message, txHash }` and await `refreshState?.()` on `{ success: true, status: "completed" }`.

## Shell coordination

All Market shell overrides (including hiding `.app-header` on `/market`) are scoped inside `market.css` using `.app-shell:has(.market-screen)` so `scan-shell.tsx`, `globals.css`, Scan, Collection, and Battle remain untouched.
