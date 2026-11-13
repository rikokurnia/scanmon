# Market integration

`GameProvider` installs `createChainMarketAdapter()` above all routes. Its immutable snapshots come from the central NEAR game store, including contract-owned Koban stock, the connected account's actual card instances, raid locks, and loading/error state.

The original NDJSON merchant dialogue route still uses server-side Gemini/DeepSeek credentials. The chain adapter supplies the final contract quote and availability; AI output cannot choose settlement amounts. `acceptOffer` uses the connected wallet, verifies the final receipt and game settlement event, opens the shared receipt modal, and refreshes ownership and balances. Price changes and rejected FT transfers surface as refunds, never completed trades.

Buy uses USDC `ft_transfer_call`; Sell uses reserved Koban funds and a private rollback callback. `PlayerMarket` additionally exposes on-chain listing, cancellation, player purchase and seller-credit withdrawal. Listing escrow removes cards from Collection and Battle until they are cancelled or transferred to the buyer.

The shared Settings control remains available on Market. The existing approved Koban artwork, video/poster, and Buy/Sell interface are preserved.

See [contract behavior](../../../smartcontract/README.md), [deployment](../../../docs/vercel-deployment.md), and [verification](../../../docs/integration-validation.md). The legacy Koban adapter's disconnected settlement method is only a fallback; the root provider supplies live settlement in the app.
