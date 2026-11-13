# Battle integration

`GameProvider` installs `createChainBattleAdapter()` above route changes. It reads the same NEAR-owned card instances as Collection and Market. Team preferences are stored per network/account; the contract revalidates the three unique owned instances before every raid.

`start_raid` and `attack` execute on the game contract. HP, skill validity, turn number, battle ID, actor eligibility, heavy-attack warnings and victory/loss are authoritative on-chain state. Active team cards cannot transfer, list or sell. New immutable snapshots refresh the existing arena UI after finality.

Victory exposes `claim_loot`, which pays 2 USDC + 10 Shards from Tomo's finite deposited budget, at most once per raid and account/UTC day. Payout callbacks release reservations on failure; loot never appears granted solely because an animation finished. First-win task progression is read from the contract. The root transaction modal links directly to the final NEAR Explorer receipt.

Gameplay statistics are scanMon's rules; printed values in supplied artwork remain reference art. Quick Match is still an unavailable PvP screen, as PvP is outside the requested raid MVP. The offline Collection adapter remains a fallback for interface tests, while the normal app always installs the chain adapter.

See [contract behavior](../../../smartcontract/README.md), [deployment](../../../docs/vercel-deployment.md), and [verification](../../../docs/integration-validation.md). Real testnet raids, transfers, rewards, duplicate prevention, escrow cancellation and rollback receipts are recorded in the public validation artifacts.
