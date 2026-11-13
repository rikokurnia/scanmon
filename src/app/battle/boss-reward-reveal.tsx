"use client";
/* eslint-disable @next/next/no-img-element -- Supplied reveal art and GIFs. */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { peelGeometry } from "@/lib/peel";
import Link from "next/link";
import { CARD_CATALOG } from "../collection/card-catalog";
import "./boss-reward-reveal.css";

export default function BossRewardReveal({
  onClose,
  onClaim,
  claimed,
  inVault,
}: {
  onClose: () => void;
  onClaim?: () => Promise<void>;
  claimed: boolean;
  inVault: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimLock = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const animation = useRef(0);
  const point = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const [geometry, setGeometry] = useState<ReturnType<
    typeof peelGeometry
  > | null>(null);
  const [phase, setPhase] = useState<
    "summon" | "mystery" | "peeling" | "revealed"
  >("summon");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const peel = useRef<HTMLButtonElement>(null);
  const claim = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      cancelAnimationFrame(animation.current);
      element?.close();
      if (timer.current) clearTimeout(timer.current);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (phase === "mystery") peel.current?.focus();
    if (phase === "revealed") claim.current?.focus();
  }, [phase]);
  function intro() {
    if (timer.current) return;
    timer.current = setTimeout(
      () => {
        timer.current = null;
        setPhase("mystery");
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2080,
    );
  }
  function position(x: number, y: number) {
    const box = canvas.current!.getBoundingClientRect();
    point.current = { x, y };
    setGeometry(peelGeometry(box.width, box.height, x, y));
  }
  function reveal() {
    if (phase !== "mystery") return;
    setPhase("peeling");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("revealed");
      return;
    }
    const box = canvas.current!.getBoundingClientRect();
    const from = point.current ?? { x: box.width, y: 0 };
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / 420),
        e = 1 - Math.pow(1 - t, 3);
      position(
        from.x + (-box.width * 0.8 - from.x) * e,
        from.y + (box.height * 1.8 - from.y) * e,
      );
      if (t < 1) animation.current = requestAnimationFrame(tick);
      else setPhase("revealed");
    }
    animation.current = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    if (
      Math.hypot(
        event.clientX - drag.current.x,
        event.clientY - drag.current.y,
      ) > 5
    )
      drag.current.moved = true;
    const box = canvas.current!.getBoundingClientRect();
    position(
      Math.min(box.width, event.clientX - box.left),
      Math.max(0, event.clientY - box.top),
    );
  }
  function release(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const moved = drag.current.moved;
    skipClick.current = moved;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const box = canvas.current!.getBoundingClientRect();
    if (
      !moved ||
      (point.current &&
        Math.hypot(box.width - point.current.x, point.current.y) >
          box.width * 0.3)
    )
      reveal();
    else {
      point.current = null;
      setGeometry(null);
    }
  }
  async function save() {
    if (claimLock.current || claimed || !onClaim) return;
    claimLock.current = true;
    setBusy(true);
    setError("");
    try {
      await onClaim();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed. Try again.");
    } finally {
      claimLock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`boss-reward-dialog boss-reward-${phase}`}
      aria-label="Daily Boss first-clear reward"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        className="battle-back boss-reward-close"
        onClick={onClose}
        disabled={busy}
        aria-label="Close boss reward"
      >
        ×
      </button>
      <div className="boss-reward-body">
        <h2>
          {claimed
            ? inVault
              ? "In your vault"
              : "Reward claimed"
            : "First-clear reward"}
        </h2>
        {phase === "summon" && (
          <>
            <img
              className="boss-reward-starfall"
              src="/assets/battle/summon-starfall.gif"
              alt=""
              onLoad={intro}
              onError={() => setPhase("mystery")}
            />
            <p role="status">A new card awaits…</p>
            <button
              className="boss-reward-skip"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                timer.current = null;
                setPhase("mystery");
              }}
            >
              Skip animation
            </button>
          </>
        )}
        <div
          ref={canvas}
          className={`boss-reward-canvas ${geometry ? "is-uncovered" : ""}`}
          aria-hidden={phase === "summon"}
        >
          <div className="boss-reward-open-art">
            <img
              className="boss-reward-frame"
              src="/assets/reveal/frame.png"
              alt=""
            />
            <picture className="boss-reward-character">
              <source
                media="(prefers-reduced-motion: reduce)"
                srcSet="/assets/battle/boss-still.png"
              />
              <img
                src="/assets/battle/boss.gif"
                alt="Almarts27 Hamster riding its unicorn"
              />
            </picture>
            <img
              className="boss-reward-card"
              src={CARD_CATALOG["almarts27-hamster-boss"].cardImageSrc}
              alt="Almarts27 Hamster full-art boss collectible"
            />
          </div>
          {(phase === "mystery" || phase === "peeling") && (
            <>
              <div
                className="boss-reward-sticker"
                style={{ clipPath: geometry?.top }}
              >
                <img
                  src="/assets/reveal/mystery-clean.png"
                  alt="Iridescent mystery sticker with a curled upper-right corner"
                />
              </div>
              {geometry && (
                <div
                  className="boss-reward-peel-back"
                  style={{
                    clipPath: geometry.back,
                    transform: geometry.matrix,
                  }}
                >
                  <img src="/assets/reveal/mystery-clean.png" alt="" />
                  <span />
                </div>
              )}
              <button
                ref={peel}
                className="boss-reward-peel-corner"
                disabled={phase === "peeling"}
                aria-label="Peel upper-right corner to reveal boss reward"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, moved: false };
                }}
                onPointerMove={move}
                onPointerUp={release}
                onPointerCancel={() => {
                  drag.current = null;
                  point.current = null;
                  setGeometry(null);
                }}
                onClick={() => {
                  if (skipClick.current) {
                    skipClick.current = false;
                    return;
                  }
                  reveal();
                }}
              />
              {phase === "mystery" && (
                <p className="boss-reward-peel-hint">
                  Peel the corner to reveal ↗
                </p>
              )}
            </>
          )}
        </div>
        {phase === "revealed" && (
          <div className="boss-reward-action">
            {claimed ? (
              <>
                <p role="status">
                  {inVault
                    ? "Boss NFT claimed. Synced to your vault."
                    : "Your first-clear boss reward has already been claimed."}
                </p>
                <Link
                  href="/collection"
                  className="battle-yellow"
                  onClick={onClose}
                >
                  Open Collection
                </Link>
              </>
            ) : (
              <>
                <button
                  ref={claim}
                  className="battle-yellow"
                  disabled={busy || !onClaim}
                  onClick={() => void save()}
                >
                  {busy ? "Claiming…" : "Claim boss NFT"}
                </button>
                <p>Mint to your vault on NEAR · first clear only</p>
                {!onClaim && <p>Reward claim unavailable</p>}
              </>
            )}
            {error && (
              <p className="boss-reward-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
