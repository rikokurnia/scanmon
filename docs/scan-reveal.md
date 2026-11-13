# Scan peel and reveal

The successful scan CTA now opens a centered 16:9 foil sticker. Drag the curled upper-right corner down/left or tap it (Enter/Space also work). Short drags return to rest, longer drags finish with a 420 ms fold. Escape or the close control cancels/returns to scanning. A completed peel reveals the catalog card on the glossy right and the matching front-idle character over the transparent left. Supplied PNG alpha is preserved and the finished card uses `object-fit: contain`.

The fold uses a perpendicular-bisector clipping plane and a reflected underside, inspired by the layering/drag approach researched at https://andrewplummer.github.io/peel-js/ and https://github.com/andrewplummer/peel-js. The implementation is native React pointer events, CSS clip paths, and requestAnimationFrame; no library source was copied. Motion reduction removes the entrance/fold animations and selects static first-frame character renditions.

ZXing now scans the attached video with `reader.scan`, independently of stream ownership. Detection pauses the decoder; it does not stop tracks or replace the live video with a photo. Closing resumes the decoder on the same camera stream, with a short cooldown. Leaving Scan and hiding the page still release the camera.

## Integration boundary

At implementation time the scanner returned only a barcode, and Collection's page passed a permanent empty array into the existing `CollectionScreen`. No scan service, card-ID response, or ownership-update function existed in this checkout.

For this frontend pass, `resolveScanResult` provides a deterministic local v1 roster result. `resolveRevealAssets` resolves both artwork paths exclusively from that result's one canonical `cardId`. `addRevealedCard` is called only when peeling finishes and updates the same local store read by the existing Collection component. The scan result ID and normalized barcode make retries/reopening idempotent. A storage failure offers Retry save rather than reporting a successful save. This is browser-local ownership, not a server grant, on-chain mint, or reward eligibility.

Replace the local resolver with a service-supplied `ScanResult` and connect the collection mutation to the authenticated inventory when those services exist. The local roster uses the seven supplied front-idle GIFs. Doge and the boss remain in the existing catalog but are excluded from local scan resolution because matching front-idle files are not supplied; no unrelated animation is substituted.

## Verification

Lint, TypeScript, 10 unit tests, and production build. Tests cover canonical UPC/EAN resolution, matching assets, idempotent Collection writes, and fold reflection geometry. gstack browser checks used actual ZXing decoding on generated EAN image frames in a synthetic live camera stream. The track remained live through peel, reveal, close, and repeated reveal; it ended when navigating to Collection. Tap, synthetic drag/release and short-drag rollback were checked, alongside 360/390 px layout and 16:9 sizing. Physical phone camera/touch hardware was unavailable.

## Starfall, privacy gate, and shared progress

The supplied `summon-starfall.gif` now plays one 2,080 ms cycle before the mystery slides in. The timer starts on the GIF's load event and is canceled if the reveal closes. Reduced motion skips the effect. All four reveal images load eagerly and complete `decode()` before the mystery can become visible. The character/card/frame wrapper has explicit hidden visibility until an intentional peel begins; it does not rely on an asynchronously loading sticker to cover secret content. This prevents a cold-load flash of the result. The real card receives a subtle repeating sheen clipped to its actual aspect ratio after reveal; reduced motion disables it.

Tomo's bubble is raised 20 px. Fixed MVP scan tasks subscribe to canonical unique-barcode progress. A persistent shell observer advances the win task only from a connected Battle adapter's `won` result, once. Go to Battle is now navigable. Claims remain unavailable until real settlement is connected; no AI inference or paid reward is simulated for these fixed task templates.

Verified the same revealed instance through Collection → Battle team save → Market Sell, and Tomo progress after navigation/reload. Current Battle/Market adapters consume the same collection key and collection/storage events. Browser-local state is shared across menus on one origin, not across devices or newly generated tunnel hostnames.

Verification: 12 library tests plus 10 Battle/Collection/Market interface tests, lint, typecheck, and production build. The barcode test samples 500 valid codes, checks repeat/canonical stability, reaches all seven supported characters, and locks an existing v1 mapping. A browser frame monitor recorded 412 pre-peel frames with zero visible character/card content. Gloss was verified with infinite iteration; first-scan progress and disabled unpaid claims were checked in Tomo.
