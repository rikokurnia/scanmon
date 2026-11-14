# Landing and desktop shell handoff

The root route is the woodland landing. Start Game enters `/scan`; existing game routes remain directly addressable. The root SoundRuntime and GameProvider stay mounted across client navigation. The app is live inside a CSS device frame, with no iframe or duplicate game instance. On widths below 768px it fills the mobile viewport. Route-specific scrolling stays inside the frame, including Market's viewport-height exception. Existing arena navigation behavior remains intact.

## Files

- `src/app/page.tsx`: deployment account selection from runtime settings and checked-in deployment manifest.
- `src/components/landing-page.tsx`, `landing.css`: live branding, plaque controls, aura/glint, native modal dialogs, guide, account links, shared sound toggle.
- `src/components/scan-shell.tsx`, `src/app/globals.css`: landing/game route boundary, outer branding, responsive frame and scrolling containment.
- `src/app/collection/collection-screen.tsx`: empty collection's Scan link now points to `/scan`.
- `src/lib/sound.ts`: click capture also unlocks audio, including assistive activation without pointerdown.
- `public/assets/landing/`: the three supplied PNG files, copied unchanged from `random/scanmon-asets/layout-references/scanmon-landing-assets/`.
- `package.json`, `package-lock.json`: locally served Young Serif and Cinzel fonts.

## Sources

Read `AGENTS.md`, `random/prd.md`, `random/ideas-and-criteria/SCANMON_ASSETS_PATH.md`, both supplied visual references, existing mobile shell and route styles, installed frontend-design-guidelines skill, and installed Next.js layout documentation before implementation. Used gstack browse for browser checks.

Audio reuses `src/lib/sound.ts`, `src/components/sound-runtime.tsx`, `docs/sound-integration.md`, and unchanged `public/sounds/bgm.mp3` and `click.mp3`. The existing mute preference is `scanmon:sound-muted`; music gain remains 0.25. No new audio controller or volume preference was introduced.

Deployment sources: `smartcontract/deployments/testnet.json`, `final-state.json`, `pvp-web-deployment.json`, `src/lib/near/config.ts`, and explicit account IDs in local runtime configuration. The game contract is `scanmon-6f49a2b600.testnet`; card minting/ownership, trading, Tomo rewards, raid loot, and PvP escrow share this contract. Test USDC is `usdc.scanmon-6f49a2b600.testnet`. Agent wallets are `tomo.scanmon-6f49a2b600.testnet` and `koban.scanmon-6f49a2b600.testnet`. All account links use the existing testnet Nearblocks explorer helper. Agent wallets are labeled separately from contracts. No missing deployment account IDs were found for the requested roles; deployment verification here means repository deployment records and matching configuration, not a fresh chain audit.

The guide matches the current reward button, **Claim boss card**, rather than the requested generic “Claim Loot” label.

## Verification

- TypeScript, targeted ESLint, all 39 existing tests, and production build passed.
- Compared landing and game screenshots with `landig-page-reference.png` and `dashboard-reference.png`.
- Browser checks at 1440×810, 1280×600, 768×1024, and 375×812. At 1280×600, phone bounds are y24–576 and nav bottom is y564; document is exactly 1280×600. Market also fits those bounds after its route-specific minimum height override.
- Start Game opens the existing Scan screen. Collection navigation, Battle, Market, and Settings render existing controls. Existing test coverage checks gameplay, card ownership, raid flow, market state, PvP combat, and audio behavior.
- Both landing dialogs open; close control receives initial focus, Escape closes and restores trigger focus. Mobile guide scrolls internally and all seven images load. About links resolve to the four configured account URLs.
- Instrumented browser Web Audio: first landing activation creates one AudioContext, starts the 1.10-second click effect and the 92.18-second looping soundtrack. Dialog activations and Start Game preserve the same context with exactly one looping source. Settings uses the shared mute preference. Existing audio test covers persisted mute, one loop, 0.25 music gain, canceled effects, and background suspension.
- Aura and plaque glint use continuous CSS loops. Pointer and keyboard activations share press feedback; reduced motion disables loops and activation animation while retaining static halo/highlights and focus accents.
- Fresh landing load has no browser console errors. New player-facing copy is English.

## Limits

No separate current-desktop screenshot attachment was accessible in the workspace; the existing running desktop app and both named references were inspected. No wallet login, signed transaction, real camera, speaker/listening, or physical iOS safe-area test was performed. Authentication and transaction handlers were preserved. No deployment was requested or performed.

## Vercel build boundary

`.vercelignore` excludes `smartcontract/`. Landing defaults therefore import `src/lib/near/public-deployment.json`, a public-account-only snapshot of `smartcontract/deployments/testnet.json`. Update this snapshot when redeploying contracts; runtime environment values still take priority. No signing keys or deployment tooling are included.
