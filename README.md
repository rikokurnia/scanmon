# scanMon

Live app: https://scannmon.vercel.app

A mobile-first barcode monster game on **NEAR testnet**. Scan and reveal a discovery, mint a NEP-245 card, collect a team, fight the raid boss, claim Tomo rewards, and trade with Koban or other hunters using **USDC.mock**.

## Run locally

```bash
npm ci
npm run dev
```

Use the existing ignored `.env` and `.env.local`, or copy `.env.example` and supply your own credentials. Open `http://localhost:3000`. A deployed phone camera needs HTTPS. Camera frames remain on-device; the current Scan screen uses the camera, with retry handling for camera errors.

## What is connected

- **Google + NEAR wallets:** Privy creates and signs for NEAR implicit wallets. HERE, Meteor and MyNearWallet use NEAR Wallet Selector. Settings shows account ID, native NEAR, wallet USDC, Shards, and withdrawable player-sale credit.
- **Scan / Collection:** contract checksum validation and a stable season roster; one discovery per account/barcode. Collection only displays chain-owned cards, including after a trade or reload.
- **Tomo:** contract-verified tasks, finite funded reward budget, actual agent account and balances, and confirmed Explorer receipts.
- **Market:** contract-priced Koban inventory and finite buying budget, escrowed sales, player listings/cancellation, atomic purchase settlement, and USDC withdrawals.
- **Battle:** three owned cards, on-chain rounds and HP, active-team transfer locks, and once-per-day USDC + Shard loot.
- **History / proofs:** one root-level wallet and economy store; finality checks, failed/refunded settlement handling, redirect recovery, account-scoped cached receipts, paginated NearBlocks v3 account history, and direct Explorer links.
- **Artwork:** the supplied original NEAR and USDC marks are displayed with rounded styling. Existing card and companion artwork is preserved.

[Live game contract](https://testnet.nearblocks.io/address/scanmon-6f49a2b600.testnet) · [Mock USDC](https://testnet.nearblocks.io/address/usdc.scanmon-6f49a2b600.testnet) · [Contract source and methods](smartcontract/README.md)

USDC.mock has no cash value. The app displays the actual Tomo subaccount, `tomo.scanmon-6f49a2b600.testnet`; it does not control the unrelated `tomo.testnet` account.

## Deployment

Read [Vercel deployment and exact environment variables](docs/vercel-deployment.md). Vercel builds the Next.js app; contracts are already deployed. Deployment/treasury keys remain local and ignored. Only the separate low-balance sponsor key is needed by Vercel for optional Google onboarding funding.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run contract:test
npm run build
```

`npm run test:integration` uses funded QA accounts from ignored env variables to perform real testnet transactions. Public receipts and verification notes are in [the validation report](docs/integration-validation.md). It is not run as part of Vercel deployment.

The integration is scoped to the requested on-chain flows. The wider PRD's external price feeds and isolated economy fast-forward are separate features. Physical Android/iOS camera behavior still needs device testing.
