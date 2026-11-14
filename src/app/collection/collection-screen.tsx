"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explorerAccount, explorerTx, GAME_ID } from "@/lib/near/config";
import {
  type CardAssetEntry,
  type CollectionScreenProps,
  resolveCardAsset,
} from "./card-catalog";
import {
  CARD_BACK_META,
  formatContractShort,
  formatTxHashShort,
} from "./card-back-meta";
import TokenChart from "./token-chart";
import "./collection.css";

interface ResolvedOwnedCard {
  key: string;
  asset: CardAssetEntry;
  txHash?: string;
}

const MAX_TILT_DEG = 10;
const TAP_SLOP_PX = 8;

function StarIcon() {
  return (
    <svg
      className="card-back-star"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M12 2.4L14.95 8.38L21.55 9.34L16.77 14L17.9 20.57L12 17.47L6.1 20.57L7.23 14L2.45 9.34L9.05 8.38L12 2.4Z"
        stroke="#192546"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardBackFace({
  asset,
  active,
  txHash,
}: {
  asset: CardAssetEntry;
  active: boolean;
  txHash?: string;
}) {
  const meta = CARD_BACK_META[asset.id];
  const proofLabel = txHash ? "On-chain proof" : "Card contract";
  const proofText = txHash
    ? formatTxHashShort(txHash)
    : formatContractShort(GAME_ID);
  const explorerHref = txHash
    ? explorerTx(txHash)
    : GAME_ID
      ? explorerAccount(GAME_ID)
      : undefined;
  const proofTitle = txHash
    ? `View transaction ${txHash} on NEAR Explorer`
    : GAME_ID
      ? `View contract ${GAME_ID} on NEAR Explorer`
      : undefined;

  return (
    <div className={`card-back card-back--${asset.variant}`}>
      <div className="card-back-inner-border" aria-hidden="true" />

      <div className="card-back-top">
        <div className="card-back-brand">
          <Image
            src="/assets/logo-scanmon.png"
            alt=""
            width={30}
            height={30}
            className="card-back-brand-logo"
            unoptimized
          />
          <span className="card-back-wordmark">
            scan<span>Mon</span>
          </span>
        </div>

        <div
          className="card-back-stars"
          aria-label={`${meta.stars} star rarity`}
        >
          {Array.from({ length: meta.stars }, (_, i) => (
            <StarIcon key={i} />
          ))}
        </div>
      </div>

      <div className="card-back-info">
        <h2 className="card-back-title">{asset.name.toUpperCase()}</h2>
        <p className="card-back-tagline">{meta.tagline}</p>

        <div className="card-back-contract-block">
          <span className="card-back-contract-label">{proofLabel}</span>
          {explorerHref ? (
            <a
              href={explorerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="card-back-contract-pill"
              title={proofTitle}
              aria-label={proofTitle}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src="/assets/tokens/near-original.png"
                alt=""
                width={14}
                height={14}
                className="card-back-near-icon"
                unoptimized
              />
              <span>{proofText}</span>
            </a>
          ) : (
            <div className="card-back-contract-pill">
              <Image
                src="/assets/tokens/near-original.png"
                alt=""
                width={14}
                height={14}
                className="card-back-near-icon"
                unoptimized
              />
              <span>{proofText}</span>
            </div>
          )}
        </div>
      </div>

      <TokenChart cardId={asset.id} active={active} />
    </div>
  );
}

function ReflectiveCardFrame({
  asset,
  txHash,
  priority,
  isActiveSlide,
  flipped,
  onToggleFlip,
  onSwipeNavigate,
}: {
  asset: CardAssetEntry;
  txHash?: string;
  priority: boolean;
  isActiveSlide: boolean;
  flipped: boolean;
  onToggleFlip: () => void;
  onSwipeNavigate: (direction: "prev" | "next") => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const tiltRafRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    startTime: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (tiltRafRef.current !== null) {
        window.cancelAnimationFrame(tiltRafRef.current);
      }
    };
  }, []);

  const updateTilt = (clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const px = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const rx = ((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(2);
    const ry = ((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(2);

    if (tiltRafRef.current !== null) {
      window.cancelAnimationFrame(tiltRafRef.current);
    }

    tiltRafRef.current = window.requestAnimationFrame(() => {
      tiltRafRef.current = null;
      frame.dataset.tilting = "true";
      frame.style.setProperty("--rx", `${rx}deg`);
      frame.style.setProperty("--ry", `${ry}deg`);
      frame.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      frame.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      frame.style.setProperty("--glare-opacity", "1");
    });
  };

  const resetTilt = () => {
    if (tiltRafRef.current !== null) {
      window.cancelAnimationFrame(tiltRafRef.current);
      tiltRafRef.current = null;
    }
    gestureRef.current = null;
    const frame = frameRef.current;
    if (!frame) return;
    delete frame.dataset.tilting;
    frame.style.setProperty("--rx", "0deg");
    frame.style.setProperty("--ry", "0deg");
    frame.style.setProperty("--mx", "50%");
    frame.style.setProperty("--my", "50%");
    frame.style.setProperty("--glare-opacity", "0");
  };

  return (
    <div
      ref={frameRef}
      className="collection-card-frame"
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `${asset.name} card back. Activate to flip to front.`
          : `${asset.name} card front. Activate to flip to back.`
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleFlip();
        }
      }}
      onPointerDown={(e) => {
        gestureRef.current = {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          startX: e.clientX,
          startY: e.clientY,
          startTime: performance.now(),
          moved: false,
        };
        if (e.pointerType === "touch") {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        updateTilt(e.clientX, e.clientY);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") {
          updateTilt(e.clientX, e.clientY);
        }
      }}
      onPointerMove={(e) => {
        const gesture = gestureRef.current;
        if (
          e.pointerType === "touch" &&
          gesture?.pointerId !== e.pointerId
        ) {
          return;
        }
        if (gesture && gesture.pointerId === e.pointerId) {
          const dist = Math.hypot(
            e.clientX - gesture.startX,
            e.clientY - gesture.startY,
          );
          if (dist > TAP_SLOP_PX) {
            gesture.moved = true;
          }
        }
        updateTilt(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        const gesture = gestureRef.current;
        const matched = gesture && gesture.pointerId === e.pointerId;
        if (matched) {
          const dx = e.clientX - gesture.startX;
          const dy = e.clientY - gesture.startY;
          const elapsed = performance.now() - gesture.startTime;

          if (
            gesture.pointerType === "touch" &&
            elapsed < 350 &&
            Math.abs(dx) > 55 &&
            Math.abs(dx) > Math.abs(dy) * 1.4
          ) {
            onSwipeNavigate(dx < 0 ? "next" : "prev");
          } else if (!gesture.moved && e.button === 0) {
            onToggleFlip();
          }
        }
        if (e.pointerType === "touch") {
          resetTilt();
        } else {
          gestureRef.current = null;
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") {
          resetTilt();
        }
      }}
      onPointerCancel={resetTilt}
    >
      <div
        className={`collection-card-flipper ${flipped ? "is-flipped" : ""}`}
      >
        <div className="collection-card-face collection-card-face--front">
          <Image
            src={asset.cardImageSrc}
            alt={`${asset.name} scanMon card`}
            width={asset.width}
            height={asset.height}
            className="collection-card-image"
            priority={priority}
            unoptimized
            draggable={false}
          />
          <div className="collection-card-idle-shine" aria-hidden="true" />
          <div className="collection-card-foil" aria-hidden="true" />
          <div className="collection-card-gloss" aria-hidden="true" />
          <div className="collection-card-rim" aria-hidden="true" />
        </div>

        <div className="collection-card-face collection-card-face--back">
          <CardBackFace
            asset={asset}
            active={isActiveSlide && flipped}
            txHash={txHash}
          />
          <div className="collection-card-idle-shine" aria-hidden="true" />
          <div className="collection-card-foil" aria-hidden="true" />
          <div className="collection-card-gloss" aria-hidden="true" />
          <div className="collection-card-rim" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      {direction === "prev" ? (
        <path
          d="M10.25 3.25L5.5 8L10.25 12.75"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5.75 3.25L10.5 8L5.75 12.75"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function CollectionScreen({
  cards,
  isLoading = false,
  error = null,
  initialCardId,
}: CollectionScreenProps) {
  const resolvedCards = useMemo<ResolvedOwnedCard[]>(() => {
    const list: ResolvedOwnedCard[] = [];
    cards.forEach((item, idx) => {
      const asset = resolveCardAsset(item.cardId);
      if (!asset) return;
      list.push({
        key: item.instanceId ?? `${asset.id}-${idx}`,
        asset,
        txHash: item.txHash,
      });
    });
    return list;
  }, [cards]);

  const initialIndex = useMemo(() => {
    if (!initialCardId || resolvedCards.length === 0) return 0;
    const found = resolvedCards.findIndex(
      (c) => c.key === initialCardId || c.asset.id === initialCardId,
    );
    return found >= 0 ? found : 0;
  }, [initialCardId, resolvedCards]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [flippedKey, setFlippedKey] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const lastSettledRef = useRef<number>(initialIndex);
  const hasInteractedRef = useRef(false);

  const total = resolvedCards.length;
  const safeIndex = total > 0 ? Math.min(currentIndex, total - 1) : 0;

  useEffect(() => {
    lastSettledRef.current = initialIndex;
    const track = trackRef.current;
    if (!track || total === 0) return;
    const slideWidth = track.clientWidth;
    if (slideWidth > 0) {
      track.scrollTo({ left: initialIndex * slideWidth, behavior: "auto" });
    }
  }, [initialIndex, total]);

  const readNearestIndex = useCallback(() => {
    const track = trackRef.current;
    if (!track || total <= 1) return 0;
    const width = track.clientWidth;
    if (width <= 0) return 0;
    const raw = Math.round(track.scrollLeft / width);
    return Math.max(0, Math.min(total - 1, raw));
  }, [total]);

  const commitSettledIndex = useCallback(() => {
    const settled = readNearestIndex();
    setCurrentIndex(settled);
    if (
      hasInteractedRef.current &&
      settled !== lastSettledRef.current &&
      resolvedCards[settled]
    ) {
      lastSettledRef.current = settled;
      setFlippedKey((prev) =>
        prev === resolvedCards[settled].key ? prev : null,
      );
      setLiveAnnouncement(
        `Card ${settled + 1} of ${total}: ${resolvedCards[settled].asset.name}`,
      );
    }
  }, [readNearestIndex, resolvedCards, total]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || total === 0) return;

    const supportsScrollEnd = "onscrollend" in window;

    const onScroll = () => {
      hasInteractedRef.current = true;
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          const nearest = readNearestIndex();
          setCurrentIndex(nearest);
        });
      }
      if (!supportsScrollEnd) {
        if (settleTimerRef.current !== null) {
          window.clearTimeout(settleTimerRef.current);
        }
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null;
          commitSettledIndex();
        }, 120);
      }
    };

    const onScrollEnd = () => {
      commitSettledIndex();
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) {
      track.addEventListener("scrollend", onScrollEnd);
    }

    return () => {
      track.removeEventListener("scroll", onScroll);
      if (supportsScrollEnd) {
        track.removeEventListener("scrollend", onScrollEnd);
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [commitSettledIndex, readNearestIndex, total]);

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      const track = trackRef.current;
      if (!track || total === 0) return;
      const clamped = Math.max(0, Math.min(total - 1, nextIndex));
      hasInteractedRef.current = true;
      setCurrentIndex(clamped);
      setFlippedKey(null);

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      track.scrollTo({
        left: clamped * track.clientWidth,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });

      if (prefersReducedMotion && resolvedCards[clamped]) {
        lastSettledRef.current = clamped;
        setLiveAnnouncement(
          `Card ${clamped + 1} of ${total}: ${resolvedCards[clamped].asset.name}`,
        );
      }
    },
    [resolvedCards, total],
  );

  if (isLoading) {
    return (
      <div className="collection-screen" aria-busy="true">
        <div className="collection-loading-card" role="status">
          Loading collection…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="collection-screen">
        <div className="collection-state" role="alert">
          <p className="collection-state-title">Could not load cards</p>
          <p className="collection-state-copy">{error}</p>
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="collection-screen">
        <div className="collection-state">
          <Image
            src="/assets/stickers/mystery-card.png"
            alt=""
            width={64}
            height={64}
            className="collection-state-sticker"
            unoptimized
          />
          <p className="collection-state-title">No cards yet</p>
          <p className="collection-state-copy">
            Scan a barcode to collect your first monster card.
          </p>
          <Link href="/" className="collection-state-cta">
            Scan barcode
          </Link>
        </div>
      </div>
    );
  }

  const atStart = safeIndex <= 0;
  const atEnd = safeIndex >= total - 1;
  const activeCard = resolvedCards[safeIndex];

  return (
    <div className="collection-screen">
      {activeCard && (
        <div className="collection-backdrop" aria-hidden="true">
          <Image
            key={activeCard.asset.id}
            src={activeCard.asset.cardImageSrc}
            alt=""
            width={activeCard.asset.width}
            height={activeCard.asset.height}
            className="collection-backdrop-image"
            unoptimized
          />
          <div className="collection-backdrop-scrim" />
        </div>
      )}
      <section
        className="collection-carousel"
        aria-roledescription="carousel"
        aria-label="Card collection"
      >
        <div className="collection-stage">
          <button
            type="button"
            className="collection-arrow"
            onClick={() => scrollToIndex(safeIndex - 1)}
            disabled={atStart}
            aria-label="Previous card"
          >
            <span className="collection-arrow-face">
              <ChevronIcon direction="prev" />
            </span>
          </button>

          <div
            ref={trackRef}
            className="collection-track"
            tabIndex={0}
            role="group"
            aria-label="Owned cards"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                scrollToIndex(safeIndex - 1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                scrollToIndex(safeIndex + 1);
              }
            }}
          >
            {resolvedCards.map((card, index) => {
              const isFlipped = flippedKey === card.key;
              return (
                <div
                  key={card.key}
                  className="collection-slide"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${total}: ${card.asset.name}`}
                >
                  <ReflectiveCardFrame
                    asset={card.asset}
                    txHash={card.txHash}
                    priority={index === 0}
                    isActiveSlide={index === safeIndex}
                    flipped={isFlipped}
                    onToggleFlip={() =>
                      setFlippedKey((prev) =>
                        prev === card.key ? null : card.key,
                      )
                    }
                    onSwipeNavigate={(direction) =>
                      scrollToIndex(
                        direction === "next" ? safeIndex + 1 : safeIndex - 1,
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="collection-arrow"
            onClick={() => scrollToIndex(safeIndex + 1)}
            disabled={atEnd}
            aria-label="Next card"
          >
            <span className="collection-arrow-face">
              <ChevronIcon direction="next" />
            </span>
          </button>
        </div>

        <p className="collection-counter" aria-hidden="true">
          {safeIndex + 1} / {total}
        </p>

        <p className="sr-only" role="status" aria-live="polite">
          {liveAnnouncement}
        </p>
      </section>
    </div>
  );
}
