"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ScanResult } from "@/lib/scan-result";
import { resolveRevealAssets } from "@/lib/scan-result";
import { addRevealedCard } from "@/lib/reveal-collection";
import { peelGeometry } from "@/lib/peel";
import "./scan-reveal.css";
export default function ScanReveal({
  result,
  onClose,
}: {
  result: ScanResult;
  onClose: () => void;
}) {
  const assets = resolveRevealAssets(result);
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
  const ready = loaded.length === 4;
  useEffect(() => {
    if (ready) corner.current?.focus();
  }, [ready]);
  useEffect(() => {
    corner.current?.focus();
    return () => cancelAnimationFrame(frame.current);
  }, []);
  function position(x: number, y: number) {
    const box = stage.current!.getBoundingClientRect();
    point.current = { x, y };
    setGeometry(peelGeometry(box.width, box.height, x, y));
  }
  function save() {
    try {
      addRevealedCard(result);
      setError("");
    } catch {
      setError("Couldn’t save this card. Try again.");
    }
  }
  function finish() {
    if (complete.current || !ready) return;
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
      save();
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
  const onLoad = (name: string) => () =>
    setLoaded((current) =>
      current.includes(name) ? current : [...current, name],
    );
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
        className={`reveal-stage phase-${phase}`}
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
        <div ref={stage} className="reveal-canvas">
          <Image
            className="split-frame"
            src="/assets/reveal/frame.png"
            alt=""
            fill
            unoptimized
            onLoad={onLoad("frame")}
            onError={() =>
              setError("Couldn’t load the reveal artwork. Close and try again.")
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
            <Image
              src={assets.cardImageSrc}
              alt={`${assets.name} collectible card`}
              fill
              unoptimized
              onLoad={onLoad("card")}
              onError={() =>
                setError("Card artwork unavailable. Close and try again.")
              }
            />
          </div>
          {phase !== "revealed" && (
            <>
              <div className="peel-face" style={{ clipPath: geometry?.top }}>
                <Image
                  src="/assets/reveal/mystery.png"
                  alt="Mystery monster sticker with a barcode and curled upper-right corner"
                  fill
                  unoptimized
                  onLoad={onLoad("mystery")}
                  draggable={false}
                  onError={() =>
                    setError(
                      "Sticker artwork unavailable. Close and try again.",
                    )
                  }
                />
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
                    src="/assets/reveal/mystery.png"
                    alt=""
                    fill
                    unoptimized
                    draggable={false}
                  />
                  <span />
                </div>
              )}
              <button
                ref={corner}
                className="peel-corner"
                disabled={!ready || phase !== "peel"}
                aria-label={
                  ready ? "Peel upper-right corner" : "Loading sticker"
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
        {!ready && !error && (
          <p className="reveal-note" role="status">
            Loading…
          </p>
        )}
        {error && (
          <p className="reveal-note" role="alert">
            {error}
            {phase === "revealed" && <button onClick={save}>Retry save</button>}
          </p>
        )}
      </section>
    </div>
  );
}
