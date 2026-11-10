# scanMon — Scan frontend

Mobile-first Next.js App Router, React, TypeScript, and CSS implementation. All supplied PNG artwork is preserved under `public/assets`. `scanMenu.png` is reference-only and is never rendered in the UI. Fonts are served locally.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. Phone camera access requires an HTTPS deployment (or localhost on the phone itself).

## Scope

- `/` and `/scan`: rear-camera EAN-8, EAN-13, UPC-A and UPC-E decoding via ZXing, checksum validation, permission/error recovery, torch capability checks, and labeled manual fallback in Help.
- `/collection`, `/battle`, `/market`: shared header/navigation with blank content.
- No discovery rewards, minting, collection changes, wallets, or backend calls.
- Camera frames stay on-device. A decoded frame is retained in memory for feedback and cleared on restart/navigation. Tracks stop after success, on navigation, and when the page is hidden.
- ZXing 1D result points are scan-line endpoints rather than reliable full barcode bounds, so the mint guide remains centered.
- Daily Hunt is an invitation; no fabricated progression count is displayed.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Browser verification uses gstack browse. Verified navigation and active states for all four tabs, empty secondary pages, permission-denied recovery, invalid manual checksum rejection, valid manual success, and actual ZXing decoding of generated EAN-13 image frames through a synthetic camera stream. Confirmed tracks ended after successful decoding. Checked 360, 390, and 430 px mobile widths and the 480 px shell on desktop, without horizontal overflow.

A physical phone camera was not available. Real Android/iOS camera focus, permission prompts, hardware torch, and safe-area rendering still need device verification.
