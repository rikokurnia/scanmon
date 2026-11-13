Live production: https://scannmon.vercel.app

The app is deployed and its production/preview env variables are already configured. Public routes and live history were checked after deployment.

# Deploy ScanMon to Vercel

The app and contracts target **NEAR testnet**. Payments use the deployed **USDC.mock** NEP-141 contract, not Circle-issued USDC and not real money.

## Vercel project

Import the Git repository, select the Next.js framework, and select the directory containing `package.json` as the Root Directory. This workspace calls that directory `project`. If `project` is already your Git repository root, use `.`.

Use Node.js 22 or 24, `npm ci`, and `npm run build`. Keep the default Next.js output directory. Rust is needed only to rebuild contracts locally; Vercel does not compile or deploy contracts.

Set the following environment variables for both Preview and Production **before building**:

| Variable                       | Value                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_NEAR_CONTRACT_ID` | `scanmon-6f49a2b600.testnet`                                      |
| `NEXT_PUBLIC_USDC_CONTRACT_ID` | `usdc.scanmon-6f49a2b600.testnet`                                 |
| `NEXT_PUBLIC_NEAR_RPC_URL`     | `https://test.rpc.fastnear.com`                                   |
| `NEXT_PUBLIC_USDC_IS_MOCK`     | `true`                                                            |
| `APP_ID_PRIVY`                 | The existing app ID from your local `.env`                        |
| `APP_SECRET_PRIVY`             | The existing app secret from your local `.env`; mark sensitive    |
| `NEAR_SPONSOR_ACCOUNT_ID`      | `sponsor.scanmon-6f49a2b600.testnet`                              |
| `NEAR_SPONSOR_PRIVATE_KEY`     | Copy this value privately from local `.env.local`; mark sensitive |

`NEXT_PUBLIC_PRIVY_APP_ID` is an optional alias for `APP_ID_PRIVY`. Only the app ID is sent to the browser. Never prefix a secret or private key with `NEXT_PUBLIC_`.

Optional server variables:

- `NEARBLOCKS_API_KEY`: higher quota for account-wide transaction history. Public access works without it.
- `GEMINI_API_KEY` and/or `DEEPSEEK_API_KEY`: Koban dialogue. The contract's deterministic quote and settlement remain authoritative even if AI is unavailable.

Do **not** upload `NEAR_DEPLOYER_PRIVATE_KEY`, `NEAR_USDC_PRIVATE_KEY`, `NEAR_TOMO_PRIVATE_KEY`, `NEAR_KOBAN_PRIVATE_KEY`, or any `NEAR_QA_*` keys to Vercel. They are local deployment/testing credentials. The Vercel sponsor key controls a separate low-balance account and is not a contract owner or treasury key.

A secret-free template is in [`.env.example`](../.env.example). Real credentials stay in ignored `.env` and `.env.local`, with local file permissions set to `0600`.

## Privy dashboard

Google login was verified enabled using the supplied Privy credentials. Add your Vercel production URL and each preview URL you intend to use to the app's allowed domains. Keep Google enabled under Login methods. For a custom Google OAuth configuration, follow the callback URLs displayed by Privy; the built-in configuration already reaches Google's sign-in page.

Google users create a real NEAR implicit wallet through Privy's extended-chain API. Privy signs NEAR transaction hashes; private keys never enter this application. The server verifies the user's Privy JWT, linked NEAR wallet, and Google identity before requesting a one-time 0.5 test NEAR grant. The contract enforces one grant per Privy identity hash and account, including across concurrent Vercel instances. The sponsor is a finite, refillable gas budget, not a NEP-366 relayer.

The app also supports HERE, Meteor and MyNearWallet through NEAR Wallet Selector. Existing wallet users supply their own test NEAR. Wallets may require explicit approval or a redirect for a transaction.

## First deployed session

1. Open Settings → Account and choose Google or a NEAR wallet.
2. Confirm the connected account ID, then choose **Get 25 test USDC**. The first action registers USDC storage; the second calls the one-time mock faucet.
3. Open Scan and allow camera access over HTTPS, and scan a printed product barcode. `4006381333931`, `036000291452`, and `9780201379624` are valid sample codes. Reveal and mint each discovery.
4. Check the same cards in Collection and Market. Claim verified discovery tasks from Tomo. Every successful action has an Explorer receipt.
5. Save three cards at Battle → Edit Team, start a raid, choose a healthy monster and confirm each skill. Claim loot after victory. Loot pays once per account per UTC day; quest rewards pay once per account.
6. In Market, accept a live contract quote from Koban or create a player listing. Seller proceeds from player listings are held as withdrawable USDC credit; Settings exposes the withdrawal action.
7. Check Settings → History. Recent app receipts appear immediately. The account indexer may lag; refresh or load older transactions. Its full account link remains available if the indexer is unavailable.

## Public deployment and funding

- [Game contract](https://testnet.nearblocks.io/address/scanmon-6f49a2b600.testnet)
- [Mock USDC](https://testnet.nearblocks.io/address/usdc.scanmon-6f49a2b600.testnet)
- [Tomo treasury](https://testnet.nearblocks.io/address/tomo.scanmon-6f49a2b600.testnet)
- [Koban treasury](https://testnet.nearblocks.io/address/koban.scanmon-6f49a2b600.testnet)
- [Gas sponsor](https://testnet.nearblocks.io/address/sponsor.scanmon-6f49a2b600.testnet)

Tomo and Koban each received a finite 500 USDC.mock allocation deposited into the game contract. The UI reads the remaining budgets and actual account IDs. `tomo.testnet` is an unrelated account and is not impersonated.

Refill the sponsor with **native test NEAR** by transferring to `sponsor.scanmon-6f49a2b600.testnet`. To refill agent budgets, transfer mock USDC to the corresponding agent, then have that agent call `ft_transfer_call` with the game receiver and `msg: "tomo"` or `"koban"`. Only the configured agent can fund its own reserved budget.

Changing to Circle test USDC requires deploying a fresh game configured with that FT contract, registering its storage, and funding the agents with that token. Changing only the frontend variable cannot change the payment token accepted by an existing game contract. The code does not enable mainnet deployment.

## Verification and limits

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run contract:test`, and `npm run build`. `npm run test:integration` performs real testnet writes using locally configured QA accounts and writes public transaction receipts to `smartcontract/deployments/testnet-validation.json`. It requires funded QA accounts and is not part of Vercel's build.

The integration covers the requested wallet, card, economy, settings, history, and receipt flows. The wider PRD's price-provider feeds, economy fast-forward, and gasless delegation are separate features. The current curated artwork roster is preserved. Fixed quest eligibility is checked by the contract; the AI cannot choose payouts or prices. Quests draw atomically from a shared finite pool rather than reserving a separate payout for every viewer.

The contracts retain their local owner keys for testnet upgrades. This is a hackathon deployment, not an audited mainnet release. Some third-party wallet SDK dependencies still report upstream security advisories; see `docs/integration-validation.md` for the final verification record. No deployment or treasury key is shipped to the browser.

## Documentation checked during implementation

- [Privy NEAR signing example](https://docs.privy.io/recipes/tier-2-wallet-integration)
- [Privy extended-chain wallet creation](https://docs.privy.io/wallets/wallets/create/create-a-wallet)
- [NEAR RPC providers](https://docs.near.org/api/rpc/providers): the old `rpc.testnet.near.org` endpoint returned a deprecation error during testing; FASTNEAR is used instead.
- [NearBlocks v3 migration](https://api-testnet.nearblocks.io/api-docs/migration): testnet v1 is retired; history uses `/v3/accounts/{account}/txns` and opaque pagination cursors.
- [NEP-245](https://github.com/near/NEPs/blob/master/neps/nep-0245.md)
