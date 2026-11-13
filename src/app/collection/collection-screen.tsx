"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CardAssetEntry,
  type CollectionScreenProps,
  resolveCardAsset,
} from "./card-catalog";
import "./collection.css";

interface ResolvedOwnedCard {
  key: string;
  asset: CardAssetEntry;
}

const MAX_TILT_DEG = 10;

function ReflectiveCardFrame({
  asset,
  priority,
  onSwipeNavigate,
}: {
  asset: CardAssetEntry;
  priority: boolean;
  onSwipeNavigate: (direction: "prev" | "next") => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const tiltRafRef = useRef<number | null>(null);
  const touchGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
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
    touchGestureRef.current = null;
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
      onPointerDown={(e) => {
        if (e.pointerType === "touch") {
          touchGestureRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startTime: performance.now(),
          };
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
        if (
          e.pointerType === "touch" &&
          touchGestureRef.current?.pointerId !== e.pointerId
        ) {
          return;
        }
        updateTilt(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        const gesture = touchGestureRef.current;
        if (e.pointerType === "touch" && gesture?.pointerId === e.pointerId) {
          const dx = e.clientX - gesture.startX;
          const dy = e.clientY - gesture.startY;
          const elapsed = performance.now() - gesture.startTime;
          if (
            elapsed < 350 &&
            Math.abs(dx) > 55 &&
            Math.abs(dx) > Math.abs(dy) * 1.4
          ) {
            onSwipeNavigate(dx < 0 ? "next" : "prev");
          }
        }
        resetTilt();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") {
          resetTilt();
        }
      }}
      onPointerCancel={resetTilt}
    >
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
            {resolvedCards.map((card, index) => (
              <div
                key={card.key}
                className="collection-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${total}: ${card.asset.name}`}
              >
                <ReflectiveCardFrame
                  asset={card.asset}
                  priority={index === 0}
                  onSwipeNavigate={(direction) =>
                    scrollToIndex(
                      direction === "next" ? safeIndex + 1 : safeIndex - 1,
                    )
                  }
                />
              </div>
            ))}
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
