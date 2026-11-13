# Battle integration

`GameProvider` installs `createChainBattleAdapter()` above route changes. Battle, Collection and Market read the same NEAR-owned card instance IDs. Team preferences remain account scoped. Scan routes/components/assets were not changed in this pass.

## One transaction at Claim

Start, switch and Attack do **not** call a wallet or create transaction receipts. `raid-engine.ts` resolves deterministic rounds in the browser using the contract's scanMon combat rules (360 boss HP, 120 fighter HP, Pikachu 85 / others 65 damage, boss 25 / every third round 50). Full-art printed stats remain separate artwork. A replayable session is persisted per testnet contract/account and rebuilt from actions on reload, rather than trusting cached HP or victory flags.

After victory, the reward opens automatically: fullscreen 9:16 starfall → mystery sticker → draggable/tappable peel using the same geometry helper and assets as Scan → split-frame boss/card artwork. The Claim button sits a gap equal to 30% of the displayed card's height below it. Opening, skipping or peeling does not mint. Only pressing **Claim boss NFT** calls the wallet.

`claim_boss_reward(team_ids, actions)` is the single raid transaction. It validates three unique currently owned tokens, unresolved transfers, the bounded transcript (1–32 actions), living actors, skills and victory by replaying the same rules. It then mints the first-clear `almarts27-hamster-boss` NEP-245 collectible and records its token ID. A repeated claim returns the original token, even if traded later; it never mints twice. This uses existing storage maps and does not change the persisted contract schema. Old `start_raid`, `attack` and `claim_loot` endpoints remain backward compatible, but the game UI no longer sends them.

Only a final `boss_reward` contract event counts as a successful mint. Rejected/cancelled claims can retry; redirect recovery also verifies this event. Vault ownership refreshes from the contract after finality and flows to Collection and Market. The boss collectible remains excluded from Koban trading under the existing Market policy. The NFT claim is the first-clear reward; the new Battle flow does not request a separate USDC/Shards loot transaction.

## Effects and interaction

Attack starts a continuous loop with one team action per 2.4-second round. Tapping a character card stops it (including tapping the current character), switches the actor and plays `summon-sky-drop.gif`; press Attack to resume. Loops also stop on actor defeat, victory/loss, an error or leaving the arena. Projectiles and universal hit effects are positioned using actual sprite body anchors; the boss rainbow counterattack travels in the reverse direction. Every character uses its own supplied `attack-*.png`; boss uses `rainbow-attack-almart27.png`. Both sides have looping contact hits. Effects do not mint, settle or trigger transactions.

The two summon GIFs, eight character attacks, boss attack and universal hit from `random/scanmon-asets/scanmon-battle-vfx/` all have explicit uses. Reduced motion uses static character frames and hides moving VFX; keyboard and touch controls remain available.

## Verification

- 30 TypeScript tests, including the golden combat transcript and a wallet-spy test: zero sends through start/turns, exactly one send at victorious Claim, and owned boss card in the refreshed vault.
- 20 Rust tests, including replayed victory, duplicate claim/retry after trading, incomplete victory, dead actor, forged skill, duplicate team, unresolved transfer, changed ownership and bounded replay length.
- Typecheck, lint, production build, contract tests and WASM build.
- gstack browser at 390×844 and short 360×640: looping VFX, switch stops the round timer, summon, victory reveal, no claim before the explicit button, exactly one claim after clicking, no horizontal overflow and visible Claim at 360×640. Temporary QA route removed afterward. Physical-device/reduced-motion emulation was not run.
- Deployed only the game WASM on testnet, preserving configuration. Real QA claim minted one boss NFT; retry returned the same token and collection count stayed unchanged. Public receipts: `smartcontract/deployments/boss-reward-upgrade.json`. No production/mainnet deployment was made.
