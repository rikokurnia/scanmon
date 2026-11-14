# Frontend sound

The seven supplied MP3 files are copied unchanged to `public/sounds/`. `src/lib/sound.ts` uses native Web Audio; no new dependency, backend handler, contract or environment variable is needed. `SoundRuntime` mounts once in the root layout and survives menu navigation.

- BGM starts after a pointer/keyboard gesture, loops at 0.25 gain, and stays a single loop across menu changes. Audio pauses while the tab is hidden.
- Settings has the only new UI: Mute sound / Unmute sound. It controls music and effects together, persists `scanmon:sound-muted` in localStorage and synchronizes across tabs. Muting stops active effects and cancels pending sound loads.
- Delegated click feedback covers enabled buttons, navigation links, Settings tabs, dialog backdrops and Escape dismissal, including dynamic PvP room/team controls.
- Scan beep runs once when the existing scanner accepts a validated barcode. Reveal plays on the existing card peel; no scanning or mint behavior changes.
- The shared Boss/PvP reward reveal plays reveal on peeling, plus the PvP unlocking stage.
- Coin plays only after confirmed successful task, loot, buy/sell, Boss reward or PvP prize settlement. Cancelled/failed/pending transactions and PvP refunds do not play reward audio. Successful wallet redirects and pending-transaction reconciliation use the same deduplicated transaction-hash cue.
- Raid hit follows a successfully resolved attack. PvP hit follows a new authoritative auto-battle round. Concurrent impacts are coalesced. Victory is keyed by raid/match ID to avoid repeating during polling or rerenders.

Verification: 39 tests, TypeScript, lint and production build pass. The audio test covers gesture gating, persisted mute, one BGM loop, 0.25 volume, simultaneous hit deduplication, cancellation during loading, victory deduplication and background suspension. Browser checks confirmed zero sound requests before interaction, a running audio context and one loop after the first click, immediate master mute, persisted mute after reload, continuous music on navigation, and the Settings toggle fitting a 360×640 viewport with a 46px touch target. No paid transactions or physical camera/audio-hardware tests were needed or performed for this sound-only change.

Production deployment `dpl_6etrNHSxFE6sAFa6NrrzACvodAvr` is READY at https://scannmon.vercel.app. The production Settings toggle was verified at 360px, and all seven `/sounds/*.mp3` files returned HTTP 200 and decoded successfully in Chromium (including the 92.18-second BGM).
