# Scan and Settings update

Scope: Scan reveal, Tomo, shared Settings, and the requested 25 USDC starter-pool accounting.

- Starfall uses the supplied GIF at 150% of the previous rendered width, without a visible loading caption.
- Mystery art is now the supplied `Mystery Sticker Barcode Cleanup.png`; the validated canonical product barcode is real text in its empty lower label and is clipped together with the peeling face.
- The existing character scale, layout, peel privacy gate, and matching card resolver are preserved.
- Reveal CTA has a looping sheen; Tomo cycles short phrases with letter-by-letter typing and a gentle float. Reduced motion displays static text and disables decorative animation.
- Settings keeps its Account/History and wallet controls, uses the supplied Google artwork, shows only USDC in the balance section, and uses Tomo's wood surface. Explorer links include the NEAR mark. Token on-chain metadata remains unchanged; this remains NEAR testnet.
- Reveal labels and transaction receipts are placed 30% of the reveal height below its bottom, with compact scrollable receipts on short phones. Underlying labels are hidden while a receipt is open.
- About meters show the global contract's available/distributed pool ratio, not per-account balances. Existing polling/focus refresh and post-settlement reads update every user's view from that same shared contract.

## Finite starter grant

The previous mock-token faucet minted new supply without debiting Tomo. `claim_starter` now reserves 25 USDC from the game contract's shared Tomo credit and pays a normal NEP-141 transfer. The old public token faucet is disabled. The token retains its historical faucet-claim lookup; prior claimants cannot claim a second starter grant through the game.

Eligibility and transfer callbacks refund the pool on failure, and claim/pending keys prevent duplicate/concurrent payouts. Successful starter transfers increment the shared distributed total. No state fields were added and the upgrades preserved the existing serialized state and balances.

`starter-pool-upgrade.json` and `starter-pool-validation.json` under `smartcontract/deployments` contain public upgrade and verification receipts. Live testnet verification paid one newly created QA account exactly 25 USDC, reduced Tomo's shared balance from 489 to 464 USDC, increased distributed total from 11 to 36, kept token supply unchanged, and rejected a duplicate claim. The QA transfer is a real testnet pool expenditure.

## Checks

Lint, typecheck, 26 JavaScript/TypeScript tests, production build, and 12 Rust game-contract tests passed. Rust tests cover two users drawing from one budget, duplicate rejection, old faucet claimants, and failed-transfer refunds.

Browser checks at 390px verified the new barcode digits, no visible loading caption, preserved mystery privacy, Google art, wood Settings, a USDC-only connected account (real read-only QA account), 25 history links with 25 NEAR logos, and a receipt gap of 61.75px versus 61.76px expected. About displayed the real global balance 464 USDC / distributed 36 USDC with 92.8% / 7.2% bars. Temporary QA routes were removed before the final production build. No physical phone or interactive Google/wallet approval was automated.
