# scanMon — Scan frontend

Mobile-first Next.js App Router, React, TypeScript, and CSS implementation. All supplied PNG artwork is preserved under `public/assets`. `scanMenu.png` is reference-only and is never rendered in the UI. Fonts are served locally.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. Phone camera access requires an HTTPS deployment (or localhost on the phone itself).

## Scope

- `/` and `/scan`: rear-camera EAN-8, EAN-13, UPC-A and UPC-E decoding via ZXing, checksum validation, permission/error recovery, tap-to-start camera access and labeled manual fallback in Help. The yellow scan-again button appears only after validation.
- `/collection`, `/battle`, `/market`: shared header/navigation with blank content.
- No discovery rewards, minting, collection changes, wallets, or backend calls.
- Camera frames stay on-device. A decoded frame is retained in memory for feedback and cleared on restart/navigation. Decoding pauses after success while the camera remains live; tracks stop on navigation and when the page is hidden.
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

A physical phone camera was not available. Real Android/iOS camera focus, permission prompts, and safe-area rendering still need device verification.

## Tomo companion UI preview

The Scan screen includes Tomo at the bottom-left. Open the wooden Tasks/About board to see three planned tasks (scan one item, scan three different items, win one battle), planned USDC rewards, agent funding/distribution bars, and the NEAR contract/payment-proof area. Settings uses the supplied `settings.png` artwork.

Validated barcode results, including the labeled manual fallback, advance scan progress locally in this browser. UPC-A and its equivalent leading-zero EAN-13 are treated as the same item, and repeated scans do not advance the three-item task. This local progress is for UI preview only and is not trusted reward eligibility.

The agent contract is not deployed. Balances are unavailable, Battle is unavailable, and Claim stays disabled. No wallet, AI inference, USDC transfer, or transaction receipt is simulated. NEAR receipts will require a real backend/contract connection. The displayed +1/+2/+2 USDC amounts are proposed preview rewards, not active offers.

Tomo uses the supplied animated GIF, with a static first-frame rendition for reduced motion. Token artwork attribution is included in `public/assets/tokens/ATTRIBUTION.md`.
