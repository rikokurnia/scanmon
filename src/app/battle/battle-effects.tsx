"use client";
/* eslint-disable @next/next/no-img-element -- Supplied battle VFX. */
import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import type { CardId } from "../collection/card-catalog";
import { attackArt } from "./raid-engine";

export default function BattleEffects({
  stage,
  actorId,
  cardId,
}: {
  stage: RefObject<HTMLDivElement | null>;
  actorId: string;
  cardId: CardId;
}) {
  const [points, setPoints] = useState({
    fromX: 80,
    fromY: 240,
    toX: 270,
    toY: 90,
  });
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
        fromX: a.left + a.width * 0.52 - rect.left,
        fromY: a.top + a.height * 0.55 - rect.top,
        toX: b.left + b.width * 0.54 - rect.left,
        toY: b.top + b.height * 0.48 - rect.top,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, [stage, actorId]);
  const style = {
    "--from-x": `${points.fromX}px`,
    "--from-y": `${points.fromY}px`,
    "--to-x": `${points.toX}px`,
    "--to-y": `${points.toY}px`,
  } as CSSProperties;
  return (
    <div className="battle-loop-effects" style={style} aria-hidden="true">
      <img
        className="battle-loop-projectile player-projectile"
        src={attackArt(cardId)}
        alt=""
      />
      <img
        className="battle-loop-hit boss-contact"
        src="/assets/battle/universal-hit.png"
        alt=""
      />
      <img
        className="battle-loop-projectile boss-projectile"
        src={attackArt("boss")}
        alt=""
      />
      <img
        className="battle-loop-hit player-contact"
        src="/assets/battle/universal-hit.png"
        alt=""
      />
    </div>
  );
}
