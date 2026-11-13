"use client";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type PointerEvent,
} from "react";
import type { ScanResult } from "@/lib/scan-result";
import { resolveRevealAssets } from "@/lib/scan-result";
import { mintCard, useGame } from "@/lib/near/game-store";
import { peelGeometry } from "@/lib/peel";
import "./scan-reveal.css";
export default function ScanReveal({
  result,
  onClose,
  onConnect,
}: {
  result: ScanResult;
  onClose: () => void;
  onConnect: () => void;
}) {
  const assets = resolveRevealAssets(result);
  const game = useGame();
  const [minting, setMinting] = useState(false);
  const minted = game.player?.cards.some(
    (card) => card.barcode === result.barcode,
  );
  const stage = useRef<HTMLDivElement>(null),
    corner = useRef<HTMLButtonElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const frame = useRef(0),
    complete = useRef(false),
    drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const [geometry, setGeometry] = useState<ReturnType<
    typeof peelGeometry
  > | null>(null);
  const [phase, setPhase] = useState<"peel" | "finishing" | "revealed">("peel");
  const [loaded, setLoaded] = useState<string[]>([]),
    [error, setError] = useState("");
  const skipClick = useRef(false);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const ready = loaded.length === 4;
  const canPeel = ready && introDone;
  const uncovered = canPeel && (geometry !== null || phase !== "peel");
  useEffect(() => {
    if (canPeel) corner.current?.focus();
  }, [canPeel]);
  useEffect(() => {
    corner.current?.focus();
    return () => {
      cancelAnimationFrame(frame.current);
      if (introTimer.current) clearTimeout(introTimer.current);
    };
  }, []);
  function position(x: number, y: number) {
    const box = stage.current!.getBoundingClientRect();
    point.current = { x, y };
    setGeometry(peelGeometry(box.width, box.height, x, y));
  }
  async function save() {
    if (minting || minted) return;
    if (!game.accountId) {
      setError("Connect in Settings to mint this discovery on NEAR.");
      return;
    }
    setMinting(true);
    try {
      await mintCard(result);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Mint failed. Try again.",
      );
    } finally {
      setMinting(false);
    }
  }
  function finish() {
    if (complete.current || !canPeel) return;
    complete.current = true;
    setPhase("finishing");
    const box = stage.current!.getBoundingClientRect(),
      from =
        point.current.x || point.current.y
          ? point.current
          : { x: box.width, y: 0 };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const end = () => {
      setPhase("revealed");
      void save();
      closeButton.current?.focus();
    };
    if (reduced) {
      end();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / 420, 1),
        e = 1 - Math.pow(1 - t, 3);
      position(
        from.x + (-box.width * 0.8 - from.x) * e,
        from.y + (box.height * 1.8 - from.y) * e,
      );
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else end();
    };
    frame.current = requestAnimationFrame(tick);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const box = stage.current!.getBoundingClientRect();
    if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 5)
      drag.current.moved = true;
    position(
      Math.min(box.width, e.clientX - box.left),
      Math.max(0, e.clientY - box.top),
    );
  }
  function release(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const moved = drag.current.moved;
    skipClick.current = moved;
    drag.current = null;
    const box = stage.current!.getBoundingClientRect();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (
      !moved ||
      Math.hypot(box.width - point.current.x, point.current.y) > box.width * 0.3
    )
      finish();
    else {
      point.current = { x: 0, y: 0 };
      setGeometry(null);
    }
  }
  const onLoad =
    (name: string) => async (e: SyntheticEvent<HTMLImageElement>) => {
      const image = e.currentTarget;
      try {
        await image.decode();
      } catch {
        if (!image.complete || !image.naturalWidth) {
          setError("Couldn’t load the artwork. Close and try again.");
          return;
        }
      }
      setLoaded((current) =>
        current.includes(name) ? current : [...current, name],
      );
    };
  function startIntro() {
    if (introTimer.current) return;
    // Supplied GIF: 52 frames × 40 ms. Start its timer only after it loads.
    introTimer.current = setTimeout(
      () => setIntroDone(true),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2080,
    );
  }
  if (!assets)
    return (
      <div className="reveal-unavailable" role="alert">
        Reveal artwork unavailable.<button onClick={onClose}>Close</button>
      </div>
    );
  return (
    <div
      className="reveal-layer"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <section
        className={`reveal-stage phase-${canPeel ? phase : "summoning"}`}
        role="dialog"
        aria-modal="false"
        aria-label={
          phase === "revealed"
            ? `${assets.name} revealed`
            : "Peel your mystery sticker"
        }
      >
        <button
          ref={closeButton}
          className="reveal-close"
          onClick={onClose}
          aria-label="Close reveal"
        >
          ×
        </button>
        {!introDone && (
          <Image
            className="reveal-starfall"
            src="/assets/reveal/summon-starfall.gif"
            alt=""
            width={320}
            height={320}
            unoptimized
            loading="eager"
            onLoad={startIntro}
            onError={() => setIntroDone(true)}
          />
        )}
        <div ref={stage} className="reveal-canvas">
          <div
            className="reveal-content"
            style={{ visibility: uncovered ? "visible" : "hidden" }}
            aria-hidden={!uncovered}
          >
            <Image
              className="split-frame"
              src="/assets/reveal/frame.png"
              alt=""
              fill
              unoptimized
              loading="eager"
              onLoad={onLoad("frame")}
              onError={() =>
                setError(
                  "Couldn’t load the reveal artwork. Close and try again.",
                )
              }
            />
            <div className="reveal-character">
              <picture>
                <source
                  media="(prefers-reduced-motion: reduce)"
                  srcSet={assets.idleSrc.replace(".gif", ".png")}
                />
                <Image
                  src={assets.idleSrc}
                  alt={assets.name}
                  fill
                  unoptimized
                  loading="eager"
                  onLoad={onLoad("idle")}
                  onError={() =>
                    setError(
                      "Character artwork unavailable. Close and try again.",
                    )
                  }
                />
              </picture>
            </div>
            <div className="reveal-card">
              <div
                className="card-surface"
                style={{ aspectRatio: `${assets.width}/${assets.height}` }}
              >
                <Image
                  src={assets.cardImageSrc}
                  alt={`${assets.name} collectible card`}
                  fill
                  unoptimized
                  loading="eager"
                  onLoad={onLoad("card")}
                  onError={() =>
                    setError("Card artwork unavailable. Close and try again.")
                  }
                />
                <span className="card-gloss" aria-hidden="true" />
              </div>
            </div>
          </div>
          {phase !== "revealed" && (
            <>
              <div
                className="peel-face"
                style={{
                  clipPath: geometry?.top,
                  visibility: canPeel ? "visible" : "hidden",
                }}
              >
                <Image
                  src="/assets/reveal/mystery-clean.png"
                  alt="Mystery monster sticker with a barcode and curled upper-right corner"
                  fill
                  unoptimized
                  loading="eager"
                  onLoad={onLoad("mystery")}
                  draggable={false}
                  onError={() =>
                    setError(
                      "Sticker artwork unavailable. Close and try again.",
                    )
                  }
                />
                <span className="mystery-barcode">{result.barcode}</span>
              </div>
              {geometry && (
                <div
                  className="peel-back"
                  style={{
                    clipPath: geometry.back,
                    transform: geometry.matrix,
                  }}
                >
                  <Image
                    src="/assets/reveal/mystery-clean.png"
                    alt=""
                    fill
                    unoptimized
                    loading="eager"
                    draggable={false}
                  />
                  <span />
                </div>
              )}
              <button
                ref={corner}
                className="peel-corner"
                disabled={!canPeel || phase !== "peel"}
                aria-label={
                  canPeel ? "Peel upper-right corner" : "Loading sticker"
                }
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, moved: false };
                }}
                onPointerMove={move}
                onPointerUp={release}
                onPointerCancel={() => {
                  drag.current = null;
                  point.current = { x: 0, y: 0 };
                  setGeometry(null);
                }}
                onClick={() => {
                  if (skipClick.current) {
                    skipClick.current = false;
                    return;
                  }
                  finish();
                }}
              />
            </>
          )}
        </div>
        <div className="reveal-status">
          {phase === "revealed" && (
            <div className="reveal-chain-action">
              <p>
                {minted
                  ? "Owned on NEAR · synced to your Collection"
                  : "Make this discovery yours on NEAR."}
              </p>
              {!minted && (
                <button
                  disabled={minting}
                  onClick={() => (game.accountId ? void save() : onConnect())}
                >
                  {minting
                    ? "Minting…"
                    : game.accountId
                      ? "Mint card on NEAR"
                      : "Connect to mint"}
                </button>
              )}
            </div>
          )}
          {error && (
            <p className="reveal-note" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
