"use client";
import { useEffect, useState, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { Burst } from "../battle-effects";
import { PVP_TICK_MS, type PvpHit } from "@/lib/pvp/engine";
interface Beam {
  hit: PvpHit;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export default function PvpEffects({
  stage,
  hits,
  side,
}: {
  stage: RefObject<HTMLDivElement | null>;
  hits: PvpHit[];
  side: 0 | 1;
}) {
  const reduced = useReducedMotion();
  const [beams, setBeams] = useState<Beam[]>([]);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const measure = () => {
      const rect = root.getBoundingClientRect();
      setBeams(
        hits.flatMap((hit) => {
          const a = root
            .querySelector(
              '[data-pvp-fighter="' +
                CSS.escape(hit.actor) +
                '"] .pvp-body-anchor',
            )
            ?.getBoundingClientRect();
          const b = root
            .querySelector(
              '[data-pvp-fighter="' +
                CSS.escape(hit.target) +
                '"] .pvp-body-anchor',
            )
            ?.getBoundingClientRect();
          return a && b
            ? [
                {
                  hit,
                  from: { x: a.left - rect.left, y: a.top - rect.top },
                  to: { x: b.left - rect.left, y: b.top - rect.top },
                },
              ]
            : [];
        }),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, [stage, hits]);
  if (reduced) return null;
  return (
    <div className="battle-loop-effects pvp-energy-effects" aria-hidden="true">
      {beams.map((beam) => (
        <Burst
          key={beam.hit.actor}
          from={beam.from}
          to={beam.to}
          cardId={beam.hit.source}
          side={beam.hit.side === side ? "player" : "boss"}
          count={1}
          speedFactor={PVP_TICK_MS / 1250}
          artRotation={beam.hit.side === side ? 0 : 180}
        />
      ))}
    </div>
  );
}
