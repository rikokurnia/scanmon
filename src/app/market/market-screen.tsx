"use client";
/* eslint-disable @next/next/no-img-element -- Canonical card artwork and shop still frame preserve exact aspect ratios. */

import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { TokenIcon } from "@/components/tomo-companion";
import { displayUnits, explorerAccount, GAME_ID } from "@/lib/near/config";
import { useGame } from "@/lib/near/game-store";
import type { CardId } from "../collection/card-catalog";
import { createKobanMarketAdapter } from "./koban-market-adapter";
import {
  formatUsdcAmount,
  isBossCard,
  isValidOfferForContext,
  resolveBuyCards,
  resolveSellCards,
  type MarketSnapshot,
  type MerchantOffer,
  type TradeDirection,
} from "./market-interface";
import { useMarket } from "./market-store";
import "./market.css";

const EMPTY_MARKET_SNAPSHOT: MarketSnapshot = {
  catalog: [],
  ownedCards: [],
  loading: false,
  error: null,
};

interface SelectedTradeCard {
  cardId: CardId;
  instanceId?: string;
}

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.25 3.25L5.5 8L10.25 12.75"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 6L8 10.5L12.5 6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendPaperPlaneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 11.2L20.5 3.8L16.2 20.5L11.4 13.8L3.5 11.2Z"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 3.8L11.4 13.8"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ThinkingDots() {
  return (
    <span className="koban-thinking" aria-label="Koban is thinking">
      <span>Koban is thinking</span>
      <span className="koban-thinking-dots" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="koban-thinking-dot"
            animate={{ y: [0, -5, 0], opacity: [0.45, 1, 0.45] }}
            transition={{
              duration: 0.68,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.14,
            }}
          />
        ))}
      </span>
    </span>
  );
}

export default function MarketScreen() {
  const { adapter: connectedAdapter } = useMarket();
  const defaultKobanAdapter = useMemo(() => createKobanMarketAdapter(), []);
  const adapter = connectedAdapter ?? defaultKobanAdapter;
  const subscribeAdapter = useCallback(
    (listener: () => void) => adapter.subscribe(listener),
    [adapter],
  );
  const getAdapterSnapshot = useCallback(() => adapter.getSnapshot(), [adapter]);
  const snapshot = useSyncExternalStore(
    subscribeAdapter,
    getAdapterSnapshot,
    () => EMPTY_MARKET_SNAPSHOT,
  );
  const game = useGame();
  const shouldReduceMotion = useReducedMotion();

  const [aboutOpen, setAboutOpen] = useState(false);
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [selection, setSelection] = useState<SelectedTradeCard | null>(null);

  const [speechText, setSpeechText] = useState<string | null>(null);
  const [typedLength, setTypedLength] = useState(0);
  const [hasResponded, setHasResponded] = useState(false);
  const [negotiatePhase, setNegotiatePhase] = useState<
    "idle" | "thinking" | "streaming" | "declined" | "expired" | "error"
  >("idle");
  const [negotiateError, setNegotiateError] = useState<string | null>(null);
  const [lastSubmittedMessage, setLastSubmittedMessage] = useState<
    string | null
  >(null);
  const [offer, setOffer] = useState<MerchantOffer | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [acceptPhase, setAcceptPhase] = useState<
    "idle" | "pending" | "completed" | "expired" | "failed"
  >("idle");
  const [acceptMessage, setAcceptMessage] = useState<string | null>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  const sessionIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const acceptLockRef = useRef(false);

  useEffect(() => {
    if (!aboutOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAboutOpen(false);
        aboutTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aboutOpen]);

  // Respect prefers-reduced-motion on the shop video element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      if (mq.matches) {
        video.pause();
      } else {
        void video.play().catch(() => {
          /* Poster still image remains visible when autoplay is blocked. */
        });
      }
    };
    syncMotion();
    mq.addEventListener("change", syncMotion);
    return () => mq.removeEventListener("change", syncMotion);
  }, []);

  const buyCards = useMemo(
    () => resolveBuyCards(snapshot.catalog),
    [snapshot.catalog],
  );

  const sellCards = useMemo(
    () => resolveSellCards(snapshot.ownedCards),
    [snapshot.ownedCards],
  );

  const visibleSellCards = useMemo(() => {
    if (sellCards.eligible.length === 0) return [];
    return [...sellCards.eligible, ...sellCards.locked];
  }, [sellCards]);

  const ownedCountByCardId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of snapshot.ownedCards) {
      counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.ownedCards]);

  // Track whether the 2-column card grid has more cards below the fold.
  const updateScrollCue = useCallback(() => {
    const el = gridRef.current;
    if (!el) {
      setCanScrollMore(false);
      return;
    }
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setCanScrollMore(remaining > 8);
  }, []);

  useEffect(() => {
    if (selection) return;
    const raf = window.requestAnimationFrame(updateScrollCue);
    window.addEventListener("resize", updateScrollCue);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateScrollCue);
    };
  }, [
    selection,
    direction,
    buyCards.length,
    visibleSellCards.length,
    updateScrollCue,
  ]);

  const clearNegotiation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current += 1;
    acceptLockRef.current = false;

    setSpeechText(null);
    setTypedLength(0);
    setHasResponded(false);
    setNegotiatePhase("idle");
    setNegotiateError(null);
    setLastSubmittedMessage(null);
    setOffer(null);
    setDraftMessage("");
    setAcceptPhase("idle");
    setAcceptMessage(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Automatically expire active timed offers when their deadline passes.
  useEffect(() => {
    if (!offer?.expiresAt) return;
    const msLeft = Math.max(0, offer.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      setOffer((current) =>
        current?.offerId === offer.offerId ? null : current,
      );
      setNegotiatePhase("expired");
    }, msLeft);
    return () => window.clearTimeout(timer);
  }, [offer]);

  const selectedCardAsset = useMemo(() => {
    if (!selection || isBossCard(selection.cardId)) return null;
    const match = buyCards.find((c) => c.asset.id === selection.cardId);
    return match?.asset ?? null;
  }, [buyCards, selection]);

  const bubbleFullText = useMemo(() => {
    if (speechText) return speechText;
    if (!selectedCardAsset) return "Pick a card to trade.";
    return direction === "buy"
      ? `Ask about ${selectedCardAsset.name} or name your USDC price!`
      : `Ask a question or name your USDC price for ${selectedCardAsset.name}!`;
  }, [speechText, selectedCardAsset, direction]);

  // Letter-by-letter typing reveal synchronized with streaming replies.
  useEffect(() => {
    if (!selection || negotiatePhase === "thinking") return;
    if (shouldReduceMotion) {
      const raf = window.requestAnimationFrame(() => {
        setTypedLength(bubbleFullText.length);
      });
      return () => window.cancelAnimationFrame(raf);
    }

    if (typedLength >= bubbleFullText.length) return;
    const backlog = bubbleFullText.length - typedLength;
    const step = backlog > 26 ? 2 : 1;
    const delayMs = backlog > 18 ? 14 : 22;

    const timer = window.setTimeout(() => {
      setTypedLength((prev) =>
        Math.min(bubbleFullText.length, prev + step),
      );
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [selection, negotiatePhase, bubbleFullText, typedLength, shouldReduceMotion]);

  const handleDirectionChange = (next: TradeDirection) => {
    if (next === direction && !selection) return;
    clearNegotiation();
    setSelection(null);
    setDirection(next);
  };

  const handleSelectBuyCard = (cardId: CardId, outOfStock: boolean) => {
    if (outOfStock || isBossCard(cardId)) return;
    clearNegotiation();
    setSelection({ cardId });
  };

  const handleSelectSellCard = (
    cardId: CardId,
    instanceId: string,
    eligible: boolean,
  ) => {
    if (!eligible || isBossCard(cardId)) return;
    clearNegotiation();
    setSelection({ cardId, instanceId });
  };

  const handleBackToPicker = () => {
    clearNegotiation();
    setSelection(null);
  };

  const activeOffer = useMemo(() => {
    if (!selection || !offer) return null;
    return isValidOfferForContext(offer, {
      cardId: selection.cardId,
      direction,
      instanceId: selection.instanceId,
    })
      ? offer
      : null;
  }, [offer, selection, direction]);

  const formattedOfferUsdc = activeOffer
    ? formatUsdcAmount(activeOffer.usdcAmount)
    : null;

  const sendOfferMessage = async (rawMessage: string) => {
    if (!selection || !selectedCardAsset || isBossCard(selection.cardId)) return;
    const message = rawMessage.trim();
    if (!message) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const reqSession = ++sessionIdRef.current;
    const reqContext = {
      cardId: selection.cardId,
      direction,
      instanceId: selection.instanceId,
    };

    setLastSubmittedMessage(message);
    setDraftMessage("");
    setSpeechText(null);
    setTypedLength(0);
    setNegotiatePhase("thinking");
    setNegotiateError(null);
    setAcceptPhase("idle");
    setAcceptMessage(null);

    try {
      const response = await adapter.negotiate({
        sessionId: String(reqSession),
        cardId: reqContext.cardId,
        direction: reqContext.direction,
        instanceId: reqContext.instanceId,
        message,
        signal: controller.signal,
        onStreamText: (partialReply) => {
          if (
            controller.signal.aborted ||
            sessionIdRef.current !== reqSession
          ) {
            return;
          }
          setNegotiatePhase("streaming");
          if (partialReply.trim()) {
            setSpeechText(partialReply);
          }
        },
      });

      if (controller.signal.aborted || sessionIdRef.current !== reqSession) {
        return;
      }

      setHasResponded(true);
      if (response.reply.trim()) {
        setSpeechText(response.reply.trim());
      }

      const returnedOffer = response.offer;
      if (isValidOfferForContext(returnedOffer, reqContext)) {
        setOffer(returnedOffer);
        setNegotiatePhase("idle");
        return;
      }

      const offerStatus = response.offer?.status;
      if (response.status === "declined" || offerStatus === "declined") {
        setOffer(null);
        setNegotiatePhase("declined");
      } else if (response.status === "expired" || offerStatus === "expired") {
        setOffer(null);
        setNegotiatePhase("expired");
      } else if (response.status === "error") {
        setNegotiatePhase("error");
        setNegotiateError(
          response.errorMessage ?? "Koban couldn't answer. Try again.",
        );
      } else if (response.offerIntent === "none") {
        // Player asked a general question outside offering; keep any valid active quote.
        setNegotiatePhase("idle");
      } else {
        setOffer(null);
        setNegotiatePhase("idle");
      }
    } catch (error) {
      if (controller.signal.aborted || sessionIdRef.current !== reqSession) {
        return;
      }
      setNegotiatePhase("error");
      setNegotiateError(
        error instanceof Error
          ? error.message
          : "Koban couldn't answer. Try again.",
      );
    }
  };

  const handleComposerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendOfferMessage(draftMessage);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      composerFormRef.current?.requestSubmit();
    }
  };

  const handleAcceptOffer = async () => {
    if (
      !selection ||
      !activeOffer ||
      acceptLockRef.current ||
      acceptPhase === "completed"
    ) {
      return;
    }

    acceptLockRef.current = true;
    setAcceptPhase("pending");
    setAcceptMessage(null);
    const reqSession = sessionIdRef.current;

    try {
      const result = await adapter.acceptOffer({
        offerId: activeOffer.offerId,
        cardId: activeOffer.cardId,
        direction: activeOffer.direction,
        instanceId: selection.instanceId,
        usdcAmount: activeOffer.usdcAmount,
        expiresAtSec: activeOffer.expiresAtSec,
        signature: activeOffer.signature,
      });

      if (sessionIdRef.current !== reqSession) {
        return;
      }

      if (result.success && result.status === "completed") {
        setAcceptPhase("completed");
        setAcceptMessage(result.message ?? null);
        setTypedLength(0);
        setSpeechText(
          direction === "buy"
            ? `Deal! ${selectedCardAsset?.name ?? "Your card"} is yours.`
            : `Deal! Sent you ${formattedOfferUsdc ?? activeOffer.usdcAmount} USDC.`,
        );
        await adapter.refreshState?.();
        return;
      }

      if (result.status === "expired") {
        setOffer(null);
        setNegotiatePhase("expired");
        setAcceptPhase("expired");
        setAcceptMessage(result.message ?? "Offer expired. Ask Koban again.");
        return;
      }

      setAcceptPhase("failed");
      setAcceptMessage(
        result.message ?? "Trade couldn't finish. Try again.",
      );
    } catch (error) {
      if (sessionIdRef.current !== reqSession) {
        return;
      }
      setAcceptPhase("failed");
      setAcceptMessage(
        error instanceof Error
          ? error.message
          : "Trade couldn't finish. Try again.",
      );
    } finally {
      acceptLockRef.current = false;
    }
  };

  const renderDirectionToggle = () => (
    <div className="direction-toggle" role="tablist" aria-label="Trade mode">
      <button
        type="button"
        role="tab"
        aria-selected={direction === "buy"}
        className={`direction-tab ${direction === "buy" ? "is-active" : ""}`}
        onClick={() => handleDirectionChange("buy")}
      >
        Buy
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={direction === "sell"}
        className={`direction-tab ${direction === "sell" ? "is-active" : ""}`}
        onClick={() => handleDirectionChange("sell")}
      >
        Sell
      </button>
    </div>
  );

  const isNegotiationComplete = acceptPhase === "completed";
  const isBusyNegotiating =
    negotiatePhase === "thinking" || negotiatePhase === "streaming";
  const isAcceptDisabled =
    !activeOffer ||
    !formattedOfferUsdc ||
    acceptPhase === "pending" ||
    isNegotiationComplete;

  const visibleTypedText = shouldReduceMotion
    ? bubbleFullText
    : bubbleFullText.slice(0, typedLength);
  const isTyping =
    negotiatePhase !== "thinking" &&
    !shouldReduceMotion &&
    (typedLength < bubbleFullText.length || negotiatePhase === "streaming");

  return (
    <MotionConfig reducedMotion="user">
      <section className="market-screen" aria-label="Koban Market">
        <div className="market-backdrop" aria-hidden="true">
          <video
            ref={videoRef}
            className="market-video"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/assets/market/koban-shop-still.png"
          >
            <source src="/assets/market/koban-video.mp4" type="video/mp4" />
          </video>
          <img
            className="market-still"
            src="/assets/market/koban-shop-still.png"
            alt=""
          />
        </div>

        <div className="market-upper">
          <AnimatePresence mode="wait">
            {selection && selectedCardAsset && (
              <motion.div
                key={`${selection.cardId}:${direction}`}
                className={`koban-bubble ${negotiatePhase === "thinking" ? "is-thinking" : ""}`}
                initial={{ opacity: 0, scale: 0.92, y: 6, x: "-50%" }}
                animate={{
                  opacity: 1,
                  scale: negotiatePhase === "thinking" ? [1, 1.02, 1] : 1,
                  y: 0,
                  x: "-50%",
                }}
                exit={{ opacity: 0, scale: 0.94, x: "-50%" }}
                transition={
                  negotiatePhase === "thinking"
                    ? {
                        scale: {
                          duration: 1.1,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                        opacity: { duration: 0.18 },
                      }
                    : { type: "spring", stiffness: 360, damping: 24 }
                }
              >
                {negotiatePhase === "thinking" ? (
                  <ThinkingDots />
                ) : (
                  <p className="koban-bubble-text">
                    {visibleTypedText}
                    {isTyping && (
                      <span
                        className="koban-typing-cursor"
                        aria-hidden="true"
                      />
                    )}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Announce completed replies to assistive tech without per-letter spam */}
          <p className="visually-hidden" role="status" aria-live="polite">
            {negotiatePhase === "thinking"
              ? "Koban is thinking."
              : speechText ?? ""}
          </p>
        </div>

        <div className="market-lower">
          {!selection || !selectedCardAsset ? (
            <>
              <div className="market-picker-header">
                <h1 className="market-title">Market</h1>
                <div className="market-picker-toolbar">
                  <motion.button
                    ref={aboutTriggerRef}
                    type="button"
                    className="koban-about-trigger is-left"
                    aria-label="About Koban"
                    aria-expanded={aboutOpen}
                    aria-haspopup="dialog"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setAboutOpen((open) => !open)}
                  >
                    <span aria-hidden="true">!</span>
                  </motion.button>
                  {renderDirectionToggle()}
                </div>
              </div>

              {snapshot.error && (
                <p className="market-inline-status" role="alert">
                  {snapshot.error}
                </p>
              )}

              {snapshot.loading ? (
                <div className="market-empty-state" role="status">
                  <p className="market-empty-title">
                    {direction === "buy" ? "Loading shop…" : "Loading cards…"}
                  </p>
                </div>
              ) : direction === "buy" ? (
                <div className="market-grid-shell">
                  <div
                    ref={gridRef}
                    className="market-card-grid"
                    onScroll={updateScrollCue}
                    aria-label="Buy cards catalog"
                  >
                    {buyCards.map((item) => {
                      const ownedCount =
                        ownedCountByCardId.get(item.asset.id) ?? 0;
                      return (
                        <button
                          key={item.asset.id}
                          type="button"
                          disabled={item.outOfStock}
                          className={`market-card-button ${item.outOfStock ? "is-unavailable" : ""}`}
                          aria-label={
                            item.outOfStock
                              ? `${item.asset.name}, Out of stock${ownedCount > 0 ? `, Owned ${ownedCount}x` : ""}`
                              : `Negotiate to buy ${item.asset.name}${ownedCount > 0 ? `, Owned ${ownedCount}x` : ""}`
                          }
                          onClick={() =>
                            handleSelectBuyCard(item.asset.id, item.outOfStock)
                          }
                        >
                          <span className="market-card-media">
                            <img
                              src={item.asset.cardImageSrc}
                              alt={`${item.asset.name} card`}
                              width={item.asset.width}
                              height={item.asset.height}
                              className="market-card-img"
                              draggable={false}
                            />
                            {ownedCount > 0 && (
                              <span className="market-card-owned-badge">
                                Owned {ownedCount}x
                              </span>
                            )}
                            {item.outOfStock && (
                              <span className="market-card-badge">
                                Out of stock
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {canScrollMore && (
                    <button
                      type="button"
                      className="market-scroll-cue"
                      aria-label="Scroll to more cards"
                      onClick={() => {
                        gridRef.current?.scrollBy({
                          top: 220,
                          behavior: "smooth",
                        });
                      }}
                    >
                      <span className="market-scroll-cue-face">
                        <DownChevronIcon />
                      </span>
                    </button>
                  )}
                </div>
              ) : visibleSellCards.length === 0 ? (
                <div className="market-empty-state" role="status">
                  <p className="market-empty-title">No cards to sell</p>
                  <p className="market-empty-copy">
                    {sellCards.locked.length > 0
                      ? "Your standard cards are currently locked."
                      : "Scan a barcode or buy a card to trade here."}
                  </p>
                </div>
              ) : (
                <div className="market-grid-shell">
                  <div
                    ref={gridRef}
                    className="market-card-grid"
                    onScroll={updateScrollCue}
                    aria-label="Owned cards to sell"
                  >
                    {visibleSellCards.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        disabled={!item.eligible}
                        className={`market-card-button ${!item.eligible ? "is-unavailable" : ""}`}
                        aria-label={
                          item.eligible
                            ? `Negotiate to sell ${item.asset.name}`
                            : `${item.asset.name}, ${item.ineligibleReason ?? "Unavailable"}`
                        }
                        onClick={() =>
                          handleSelectSellCard(
                            item.asset.id,
                            item.instanceId,
                            item.eligible,
                          )
                        }
                      >
                        <span className="market-card-media">
                          <img
                            src={item.asset.cardImageSrc}
                            alt={`${item.asset.name} card`}
                            width={item.asset.width}
                            height={item.asset.height}
                            className="market-card-img"
                            draggable={false}
                          />
                          {!item.eligible && item.ineligibleReason && (
                            <span className="market-card-badge">
                              {item.ineligibleReason}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  {canScrollMore && (
                    <button
                      type="button"
                      className="market-scroll-cue"
                      aria-label="Scroll to more cards"
                      onClick={() => {
                        gridRef.current?.scrollBy({
                          top: 220,
                          behavior: "smooth",
                        });
                      }}
                    >
                      <span className="market-scroll-cue-face">
                        <DownChevronIcon />
                      </span>
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="market-negotiation">
              <div className="market-toolbar">
                <button
                  type="button"
                  className="market-back-button"
                  aria-label="Back to card picker"
                  onClick={handleBackToPicker}
                >
                  <span className="market-back-face">
                    <BackArrowIcon />
                  </span>
                </button>
                {renderDirectionToggle()}
                <motion.button
                  ref={aboutTriggerRef}
                  type="button"
                  className="koban-about-trigger is-right"
                  aria-label="About Koban"
                  aria-expanded={aboutOpen}
                  aria-haspopup="dialog"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setAboutOpen((open) => !open)}
                >
                  <span aria-hidden="true">!</span>
                </motion.button>
              </div>

              <div className="negotiation-stage">
                <div className="negotiation-card-wrap">
                  <div className="negotiation-card-frame">
                    <img
                      src={selectedCardAsset.cardImageSrc}
                      alt={`${selectedCardAsset.name} scanMon card`}
                      width={selectedCardAsset.width}
                      height={selectedCardAsset.height}
                      className="negotiation-card-img"
                      draggable={false}
                    />
                  </div>
                </div>

                <div className="offer-panel" aria-live="polite">
                  <div className="offer-panel-header">
                    <h2 className="offer-panel-label">Koban’s offer</h2>
                    {direction === "buy" &&
                      (ownedCountByCardId.get(selectedCardAsset.id) ?? 0) >
                        0 && (
                        <span className="offer-owned-note">
                          Owned{" "}
                          {ownedCountByCardId.get(selectedCardAsset.id)}x
                        </span>
                      )}
                  </div>

                  {isNegotiationComplete ? (
                    <>
                      <p className="offer-status-text is-success">
                        {acceptMessage ??
                          (direction === "buy"
                            ? `Bought ${selectedCardAsset.name} for ${formattedOfferUsdc ?? activeOffer?.usdcAmount ?? ""} USDC.`
                            : `Sold ${selectedCardAsset.name} for ${formattedOfferUsdc ?? activeOffer?.usdcAmount ?? ""} USDC.`)}
                      </p>
                      <button
                        type="button"
                        className="market-done-button"
                        onClick={handleBackToPicker}
                      >
                        Back to Market
                      </button>
                    </>
                  ) : (
                    <>
                      {activeOffer && formattedOfferUsdc ? (
                        <div className="offer-amount-block">
                          <span
                            className={`offer-direction-tag ${direction === "buy" ? "is-buy" : ""}`}
                          >
                            {direction === "buy" ? "You pay" : "You receive"}
                          </span>
                          <p className="offer-amount-value">
                            {formattedOfferUsdc} USDC
                          </p>
                        </div>
                      ) : negotiatePhase === "declined" ? (
                        <p className="offer-status-text">
                          Offer declined. Try another price.
                        </p>
                      ) : negotiatePhase === "expired" ||
                        acceptPhase === "expired" ? (
                        <p className="offer-status-text">
                          {acceptMessage ?? "Offer expired. Ask Koban again."}
                        </p>
                      ) : negotiatePhase === "error" ? (
                        <>
                          <p className="offer-status-text is-error">
                            {negotiateError ?? "Couldn't reach Koban."}
                          </p>
                          {lastSubmittedMessage && (
                            <button
                              type="button"
                              className="offer-retry-button"
                              onClick={() =>
                                void sendOfferMessage(lastSubmittedMessage)
                              }
                            >
                              Retry
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="offer-status-text">
                          Waiting for Koban&apos;s offer.
                        </p>
                      )}

                      {acceptPhase === "failed" && acceptMessage && (
                        <p className="offer-status-text is-error" role="alert">
                          {acceptMessage}
                        </p>
                      )}

                      <button
                        type="button"
                        className="accept-offer-button"
                        disabled={isAcceptDisabled}
                        aria-busy={acceptPhase === "pending"}
                        onClick={() => void handleAcceptOffer()}
                      >
                        {acceptPhase === "pending"
                          ? "Accepting…"
                          : "Accept Offer"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <form
                ref={composerFormRef}
                className="market-composer"
                onSubmit={handleComposerSubmit}
              >
                <label htmlFor="market-offer-input" className="visually-hidden">
                  Offer or question for Koban
                </label>
                <input
                  id="market-offer-input"
                  name="offerMessage"
                  type="text"
                  className="market-composer-input"
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onFocus={(e) => {
                    e.currentTarget.scrollIntoView({
                      block: "nearest",
                      behavior: "smooth",
                    });
                  }}
                  placeholder={
                    hasResponded
                      ? "Make a counteroffer…"
                      : "Make an offer…"
                  }
                  enterKeyHint="send"
                  autoComplete="off"
                  disabled={isNegotiationComplete || acceptPhase === "pending"}
                />
                <button
                  type="submit"
                  className="market-send-button"
                  aria-label="Send offer"
                  disabled={
                    !draftMessage.trim() ||
                    isBusyNegotiating ||
                    isNegotiationComplete ||
                    acceptPhase === "pending"
                  }
                >
                  <SendPaperPlaneIcon />
                </button>
              </form>
            </div>
          )}
        </div>

        <AnimatePresence>
          {aboutOpen && (
            <motion.div
              className="koban-about-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setAboutOpen(false);
                  aboutTriggerRef.current?.focus();
                }
              }}
            >
              <motion.section
                className="koban-about-board"
                role="dialog"
                aria-modal="true"
                aria-label="About Koban"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 360, damping: 26 }}
              >
                <div className="koban-about-head">
                  <span className="koban-about-tab">About</span>
                  <button
                    type="button"
                    className="koban-about-close"
                    aria-label="Close Koban info"
                    onClick={() => {
                      setAboutOpen(false);
                      aboutTriggerRef.current?.focus();
                    }}
                  >
                    ×
                  </button>
                </div>

                <div className="tomo-bio">
                  <span className="tomo-bio-icon">
                    <TokenIcon token="near" />
                  </span>
                  <div>
                    <h3>Meet Koban</h3>
                    <p>Your woodland NEAR shopkeeper.</p>
                  </div>
                  <span className="agent-status">
                    {game.config ? "On NEAR" : "Connecting…"}
                  </span>
                </div>

                <div className="agent-balances">
                  <section className="agent-balance">
                    <div>
                      <TokenIcon token="usdc" />
                      <span>Agent balance</span>
                      <strong>
                        {game.config
                          ? displayUnits(game.config.koban_budget)
                          : "—"}{" "}
                        <small>USDC</small>
                      </strong>
                    </div>
                    <div
                      className="balance-track"
                      role="img"
                      aria-label="Koban USDC budget read from the game contract"
                    >
                      <span
                        style={{
                          width: `${
                            game.config &&
                            BigInt(game.config.koban_budget) > BigInt(0)
                              ? Math.min(
                                  100,
                                  Math.max(
                                    10,
                                    Number(
                                      (BigInt(game.config.koban_budget) *
                                        BigInt(100)) /
                                        BigInt(500_000_000),
                                    ),
                                  ),
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p>
                      {game.config &&
                      BigInt(game.config.koban_budget) > BigInt(0)
                        ? "Finite USDC budget deposited on-chain."
                        : "Buybacks pause when the budget is empty."}
                    </p>
                  </section>

                  <section className="agent-balance">
                    <div>
                      <TokenIcon token="usdc" />
                      <span>Shop inventory</span>
                      <strong>
                        {game.shop.reduce((sum, s) => sum + s.stockCount, 0)}{" "}
                        <small>cards</small>
                      </strong>
                    </div>
                    <div
                      className="balance-track distributed"
                      role="img"
                      aria-label="Koban card stock read from the game contract"
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (game.shop.filter((s) => s.inStock).length / 8) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <p>
                      {game.shop.filter((s) => s.inStock).length} of 8 standard
                      card types in stock.
                    </p>
                  </section>
                </div>

                <div className="agent-contract">
                  <TokenIcon token="near" />
                  <div>
                    <h4>Agent account · NEAR</h4>
                    <p>
                      {game.config ? (
                        <a
                          href={explorerAccount(game.config.koban_account_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {game.config.koban_account_id} ↗
                        </a>
                      ) : (
                        "Reading contract…"
                      )}
                    </p>
                  </div>
                  <span aria-hidden="true">↗</span>
                </div>

                <p className="agent-explainer">
                  Koban buys and sells standard scanMon cards from a limited
                  USDC balance. Every accepted deal settles on NEAR.
                </p>

                <p className="preview-notice">
                  <a
                    href={explorerAccount(GAME_ID)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Game contract ↗
                  </a>{" "}
                  · NEAR testnet
                </p>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </MotionConfig>
  );
}
