# Integration validation

Validated on NEAR **testnet** with the actual deployed game and USDC.mock contracts. No mainnet funds are used. The deployment's [final code hash and agent balances](../smartcontract/deployments/final-state.json) were fetched from RPC; the deployed game code hash exactly matches the local release WASM.

## Automated checks

- TypeScript type checking and ESLint pass.
- 25 frontend/domain tests pass, including exact six-decimal USDC conversion, barcode normalization, ownership/lock interfaces, and receipt validation.
- 8 Rust contract unit tests pass: duplicate minting, UPC normalization, checksum rejection, spoofed FT rejection, finite budgets, price response to stock, incorrect payment refunds, and unauthorized ownership transfers.
- The optimized Next.js production build passes for all routes.
- 20 real testnet integration assertions pass. The public [transaction receipt manifest](../smartcontract/deployments/testnet-validation.json) records minting, quests, exact USDC debits, Koban buy/sell, incorrect-price refunds, NEP-245 failed-receiver refunds, two-account player purchases, seller withdrawals, listing cancellation, raid locks, raid victory, loot, replay rejection, implicit-account funding and duplicate sponsorship prevention.
- The separate [failed USDC payout validation](../smartcontract/deployments/testnet-callback-validation.json) confirms a false callback result, claim release, no Shard mint, treasury restoration, and a successful retry after FT storage registration.
- The frontend receipt verifier was also run against actual finalized buy and refunded-purchase receipts. It accepts the game settlement event and rejects the refund. NEP-141 returns **used** funds; zero alone is never treated as a successful purchase.
- Local production HTTP checks confirm 25/17 distinct rows on two account-history pages, cursor pagination, HTTP 400 for an invalid account, HTTP 401 for an unauthenticated same-origin sponsor request, and HTTP 403 for a different origin.

The live integration script can resume its final sponsor checkpoint with `--resume-sponsor` after the earlier chain assertions have passed. Use fresh funded QA accounts for a complete clean rerun: discovery, quest, faucet and daily loot guards intentionally persist on-chain.

## Browser checks

Used gstack `/browse` with the production server at 390×844:

- Navigated Scan → Collection → Battle → Market using the actual bottom navigation.
- Checked no horizontal overflow at 390 px and verified Settings stays reachable on Market.
- Earlier testing verified checksum validation, reveal, peel, and wallet prompts with the then-available manual input. The latest user changes intentionally removed manual barcode entry; the current Scan screen is camera-only.
- Opened Account and History, verified the disconnected state, and captured [the Account modal](settings-account-mobile.png).
- Opened Wallet Selector and verified HERE, Meteor and MyNearWallet choices. The Settings dialog closes first so it cannot block provider modals.
- Verified Google is enabled in the Privy app and reached Google's real OAuth sign-in page. A personal Google session was not entered or completed by the agent; creating/signing through a user's authenticated Privy session remains a user-assisted check.
- Requested Pikachu's price through the merchant UI and received the current contract quote of 4.909090 USDC (displayed rounded to 4.91), rather than an invented LLM settlement price.

Physical Android/iOS camera focus, permissions and safe-area behavior were not tested on hardware. PvP, the wider PRD's external price feeds and economy fast-forward are outside this integration.

## Credentials and dependencies

Scanned the 12 locally configured sensitive values against all nonignored source files and all generated browser assets. No secret value was found. `.env` and `.env.local` are ignored and mode `0600`; compiled Rust artifacts are ignored. Public deployment JSON contains account IDs and transaction hashes only. Vercel needs the separate low-balance sponsor key, never the owner, USDC, Tomo or Koban keys.

Compatible dependency patches were applied for WebSocket, big-number, Base-X 3 and ABI types. The production dependency audit still reports upstream advisories, including old Base-X 2, `decode-uri-component`, Nano ID, UUID, Zod 3 and elliptic dependencies pulled in by wallet SDKs. The recorded audit reports 48 affected dependency entries, including propagated entries (33 high, 7 moderate, 8 low; no critical). Forcing incompatible SDK downgrades or substituting Zod 4 into Zod 3 consumers was avoided. This testnet hackathon integration is not represented as an audited mainnet release.

## Latest readiness recheck

The active domain is https://scannmon.vercel.app; the previous scanmon-near domain was removed by the owner. All seven main/raid routes returned HTTP 200, history returned 25 real transactions, an unauthenticated same-origin sponsorship request returned HTTP 401, and Privy reported Google enabled. Contract budgets remained funded. Type checking, lint, 25 frontend tests, 8 Rust tests, and the production build passed again. Personal Google authentication and physical phone camera behavior still require the user’s session/device.
