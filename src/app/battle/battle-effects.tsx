"use client";
/* eslint-disable @next/next/no-img-element -- Supplied battle VFX. */
import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CardId } from "../collection/card-catalog";
import { attackArt } from "./raid-engine";

// Three visual shots per burst; combat still resolves one action per round.
const BURST_PERIOD = 1.25;
const SHOT_TRAVEL = 0.38;
const SHOT_SPACING = 0.16;
const THEMES: Record<CardId | "boss", [string, string]> = {
  pikachu: ["#ffe735", "#ff9a13"],
  veemon: ["#4af3ff", "#2986ff"],
  gengar: ["#d47aff", "#ff4dd4"],
  doge: ["#ffb83d", "#ff6b30"],
  pepe: ["#a7ff50", "#19e7a3"],
  "nyan-cat": ["#ff8ee9", "#65efff"],
  piyomon: ["#ffb6dd", "#ff6650"],
  "chill-guy": ["#77ffda", "#9fff6b"],
  "almarts27-hamster-boss": ["#ff94ef", "#6affef"],
  boss: ["#ff94ef", "#6affef"],
};
interface Point {
  x: number;
  y: number;
}
interface Anchors {
  player: Point;
  boss: Point;
}

function Burst({
  from,
  to,
  cardId,
  delay = 0,
  side,
}: {
  from: Point;
  to: Point;
  cardId: CardId | "boss";
  delay?: number;
  side: "player" | "boss";
}) {
  const [energy, accent] = THEMES[cardId];
  const heading = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const color = {
    "--energy": energy,
    "--energy-accent": accent,
  } as CSSProperties;
  return (
    <>
      <div
        className={`battle-source-aura ${side}-source-aura`}
        style={{ ...color, left: from.x, top: from.y }}
      >
        <motion.span
          className="battle-aura-halo"
          animate={{ scale: [0.85, 1.1, 0.85], opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="battle-aura-orbit"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      </div>
      {[0, 1, 2].map((index) => {
        const wait = delay + index * SHOT_SPACING;
        const spread = (index - 1) * 8;
        return (
          <div
            key={index}
            className="battle-burst-pair"
            data-side={side}
            data-shot={index + 1}
            style={color}
          >
            <motion.div
              className={`battle-burst-shot ${side}-projectile ${cardId === "boss" || cardId === "nyan-cat" || cardId === "almarts27-hamster-boss" ? "is-rainbow" : ""}`}
              initial={{ x: from.x, y: from.y, opacity: 0 }}
              animate={{
                x: [from.x, (from.x + to.x) / 2 - spread, to.x + spread * 0.3],
                y: [from.y, (from.y + to.y) / 2 + spread, to.y + spread * 0.3],
                scale: [0.65, 1.06, 0.85],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: SHOT_TRAVEL,
                delay: wait,
                repeat: Infinity,
                repeatDelay: BURST_PERIOD - SHOT_TRAVEL,
                ease: "easeIn",
                opacity: {
                  duration: SHOT_TRAVEL,
                  delay: wait,
                  repeat: Infinity,
                  repeatDelay: BURST_PERIOD - SHOT_TRAVEL,
                  times: [0, 0.08, 0.86, 1],
                },
              }}
            >
              <div
                className="battle-shot-direction"
                style={{ transform: `rotate(${heading}deg)` }}
              >
                <span className="battle-shot-trail" />
                <span className="battle-shot-streak streak-one" />
                <span className="battle-shot-streak streak-two" />
              </div>
              <span className="battle-shot-glow" />
              <motion.img
                className="battle-burst-art"
                src={attackArt(cardId)}
                alt=""
                animate={{ rotate: [-9, 8, -9], scale: [0.92, 1.09, 0.92] }}
                transition={{
                  duration: 0.28,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.span
                className="battle-shot-orbit"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
            <motion.div
              className={`battle-burst-impact ${side === "player" ? "boss-contact" : "player-contact"}`}
              style={{ left: to.x + spread * 0.3, top: to.y + spread * 0.3 }}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{
                opacity: [0, 1, 0.85, 0],
                scale: [0.3, 1.18, 1.4, 1.6],
                rotate: [-12, 8, 14, 18],
              }}
              transition={{
                duration: 0.27,
                delay: wait + SHOT_TRAVEL,
                repeat: Infinity,
                repeatDelay: BURST_PERIOD - 0.27,
                times: [0, 0.12, 0.45, 1],
                ease: "easeOut",
              }}
            >
              <span className="battle-impact-shockwave" />
              <img
                className="battle-loop-hit"
                src="/assets/battle/universal-hit.png"
                alt=""
              />
              {[0, 1, 2, 3].map((spark) => (
                <i
                  key={spark}
                  className="battle-impact-spark"
                  style={{ transform: `rotate(${spark * 90 + 25}deg)` }}
                />
              ))}
            </motion.div>
          </div>
        );
      })}
    </>
  );
}
export default function BattleEffects({
  stage,
  actorId,
  cardId,
  enemyCardId = "boss",
}: {
  enemyCardId?: CardId | "boss";
  stage: RefObject<HTMLDivElement | null>;
  actorId: string;
  cardId: CardId;
}) {
  const reduced = useReducedMotion();
  const [points, setPoints] = useState<Anchors | null>(null);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const measure = () => {
      const actor = root.querySelector(
        `[data-fighter-id="${CSS.escape(actorId)}"] .battle-sprite img`,
      );
      const boss = root.querySelector(".battle-boss img");
      if (!actor || !boss) return;
      const rect = root.getBoundingClientRect(),
        a = actor.getBoundingClientRect(),
        b = boss.getBoundingClientRect();
      setPoints({
        player: {
          x: a.left + a.width * 0.52 - rect.left,
          y: a.top + a.height * 0.55 - rect.top,
        },
        boss: {
          x: b.left + b.width * 0.54 - rect.left,
          y: b.top + b.height * 0.48 - rect.top,
        },
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, [stage, actorId]);
  if (reduced || !points) return null;
  return (
    <div className="battle-loop-effects" aria-hidden="true" data-burst-size="3">
      <Burst
        from={points.player}
        to={points.boss}
        cardId={cardId}
        side="player"
      />
      <Burst
        from={points.boss}
        to={points.player}
        cardId={enemyCardId}
        side="boss"
        delay={0.18}
      />
    </div>
  );
}
