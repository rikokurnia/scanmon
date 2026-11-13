# Battle frontend handoff

Routes: `/battle`, `/battle/team`, `/battle/arena`, `/battle/quick-match`.

The source PRD available in this checkout is `random/prd.md`; `prd(5).md` was not present. All three approved references were present and inspected. Assets are deployed from `public/assets/battle/`; full-art cards resolve through Collection's existing `CARD_CATALOG`. No ownership is inferred from that catalog.

## Shared state hookup

From a shared **client session provider**, call `connectBattleAdapter(adapter)` from `battle-store.ts` and dispose the returned callback when the session ends. The provider must live above routes so navigation preserves state. See `BattleAdapter` and `BattleSnapshot` in `battle-interface.ts`.

- Supply immutable snapshots with stable **owned instance IDs**, canonical Collection `CardId`s, ownership loading/error state, and saved team IDs.
- Set `raidEligible`, `lockedByListing` and `ineligibleReason` from Collection/Market's authoritative state. Publish changes immediately when cards are listed, sold, or transferred. Team validation runs again before starting a raid.
- `saveTeam` must persist at most three distinct eligible instance IDs and publish the saved selection. Empty/partial teams can be edited and saved; raid entry requires `minimumTeamSize` (default 3 from PRD). Battle does not create a second ownership or team store.
- `startRaid` must publish a `BattleState` with runtime HP, round, skills, and team members. Printed stats remain solely in original card artwork. Return failures by rejecting the promise with player-readable text.
- `attack` receives battle ID, expected round, acting instance ID and skill ID. It represents **one team action per round**. Publish `resolving` immediately, then the authoritative next state. The frontend additionally locks synchronous duplicate clicks until completion. Service validation and idempotency remain required.
- Publish heavy-attack warning text, win/loss status, and reward status from the raid service. `effect` is an event with a new unique ID: a canonical character ID selects its supplied attack art; `boss` selects the rainbow attack. `hit` adds the universal contact effect. Effects last under one second; reduced motion hides effects and uses still frames instead of GIFs.

No adapter is installed by default because ownership, team persistence, and combat interfaces are absent from this checkout. Therefore normal routes show empty ownership, disabled Save Team/Attack, and honest unavailable states. No opponents, outcomes, rewards, or ownership fixtures ship in player flow. Quick Match is a frontend unavailable screen with a back action.

## Shell coordination

No shared shell, Scan, Collection, or Market files were edited. `battle.css` uses `.app-shell:has(.battle-arena)` to hide only that route's shared header/navbar, and marks Battle visually selected on nested Battle screens. If the shell later exposes a route-level layout option, replace those narrowly scoped selectors with that interface. Settings and every nav link remain the existing controls on Menu/Editor.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npx tsx --test src/app/battle/battle-interface.test.ts`: stable IDs, three-card cap, duplicate copies, listing locks, invalid saved ownership, configured raid minimum.
- gstack browse at 390×844, 430×932 and short 360×640. Opened screenshots against all three references; checked horizontal overflow, full-art aspect ratios, 44px controls, and Attack visible at 360×640. Editor scrolls on short phones.
- A temporary client adapter QA route (removed after checking) exercised selecting three cards, rejection of a fourth, disabled listed card, save → menu → re-edit with saved selection → challenge → switch → attack → resolving lock → authoritative HP/round update → return. Verified the arena hides both shell regions and the editor restores the navbar with Battle selected.
- Normal empty/unavailable flows, Quick Match back action, and shared nav links checked. Reduced-motion branches are implemented, but browser emulation could not be exercised because gstack denies Emulation.setEmulatedMedia. Physical-device Safari/Android and production raid settlement remain untested/out of scope.
