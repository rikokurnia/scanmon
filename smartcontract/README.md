# ScanMon NEAR contracts

`game` is a Rust/near-sdk NEP-245 item contract with escrow trading, NEP-141 settlement, fixed quest eligibility, and authoritative raid combat. `mock-usdc` is a testnet NEP-141 token with 6 decimals, standard storage registration, owner funding, and a one-time 25 USDC.mock faucet.

## Build and deploy

From the `project` directory:

```bash
rustup target add wasm32-unknown-unknown
npm run contract:test
npm run contract:build
npm run contract:deploy
```

The build uses an MVP WebAssembly target and pinned near-sdk 5.30.1. `Cargo.lock` pins the Rust dependency graph. Compiled artifacts are ignored. `scripts/deploy-contracts.mjs` reads signing credentials exclusively from ignored env files or process environment, checks the testnet RPC URL, creates configured subaccounts, deploys changed WASM, initializes once, registers FT storage, and seeds finite agent budgets and merchant stock. Public deployment receipts are in `deployments/testnet.json`.

Keep all local keys in `.env.local` with mode `0600`. No key value belongs in this README, scripts, source code, public receipt JSON, or the browser bundle. The Vercel application needs only the separate gas sponsor key; see [the deployment guide](../docs/vercel-deployment.md).

## Contract behavior

- `mint_scan`: checks EAN/UPC checksum, normalizes UPC-A to EAN-13, applies the immutable season-v1 species mapping, and mints one unique card per account/barcode. Attach 0.01 NEAR for permanent record storage. A repeated discovery returns its existing token.
- NEP-245 core: `mt_token`, `mt_balance_of`, `mt_batch_balance_of`, `mt_supply`, `mt_batch_supply`, `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call`, `mt_batch_transfer_call`, and a private bounded-result refund resolver. MT events use the NEP-297 `EVENT_JSON` format. Approval and metadata extensions are not implemented. Unique card supplies are one; Shards are a fungible MT token.
- `quote`, `get_shop`: one pricing rule based on species, stock, and Electric raid demand. Koban only sells tokens it owns. Repeated sales increase stock and reduce the next offer. The LLM has no settlement authority.
- `ft_on_transfer`: accepts only the configured NEP-141 contract. Exact-price buys transfer an existing escrow or merchant token; stale quotes, missing listings, and invalid purchase messages return all FT funds through the standard resolver.
- `sell_to_koban`: reserves the finite merchant budget, escrows the card, and transfers USDC. The private callback either commits the card to Koban or returns it and restores the budget. Reserved inventory slots protect asynchronous refunds against a full collection.
- `list_card`, `cancel_listing`: escrow prevents listing a token twice, transferring it, or using it in a new raid. Player purchases atomically transfer the card and credit the seller with backed USDC. `withdraw_usdc` pays that credit to the seller's registered FT wallet and restores it on failure.
- `claim_task`: one-time first discovery, three discoveries, and first claimed raid reward. Eligibility comes from on-chain progression. Reward claims reserve Tomo's deposited budget; failed payouts release the claim and restore funds. Shards mint only after a successful payout.
- `start_raid`, `attack`: three distinct owned tokens, on-chain HP/rounds, and raid locks. Each turn verifies the exact battle ID, round, living actor, and skill. Completed raids release locks.
- `claim_loot`: requires victory and current ownership of the team. Pays 2 USDC + 10 Shards once per account per UTC day and once per raid. Pending and completed claims cannot replay.
- `sponsor_player`: only the configured sponsor can submit a verified identity hash/account pair with 0.52 NEAR, of which 0.5 NEAR goes to the implicit wallet. Duplicate identity or account grants are rejected and the attached amount is refunded. The application's server verifies Privy identity and wallet ownership before this call.

Mutating transfers attach 1 yoctoNEAR. New discovery, quest, raid, listing, and loot records attach 0.01 NEAR for storage. Cards in an active raid cannot transfer or sell. A transfer-call token cannot join a new raid while its receiver callback is unresolved. Collections and active listings are bounded, empty ownership entries are removed, and callback return data is bounded.

The mock currency is not Circle USDC. Existing deployed contracts cannot be switched to another FT by a frontend variable. Deploy a new game configuration and fund the matching token's treasuries if changing currency.
