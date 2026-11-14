"use client";
/* eslint-disable @next/next/no-img-element -- Supplied full-art assets and animated GIFs. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { playSoundOnce } from "@/lib/sound";
import { useEffect, useRef, useState } from "react";
import BattleEffects from "./battle-effects";
import BossRewardReveal from "./boss-reward-reveal";
import { CARD_CATALOG } from "../collection/card-catalog";
import {
  eligible,
  teamIssue,
  toggleTeam,
  type BattleOwnedCard,
} from "./battle-interface";
import { useBattle } from "./battle-store";
import "./battle.css";

type View = "menu" | "team" | "arena" | "quick-match";
function Sprite({ id, className = "" }: { id: string; className?: string }) {
  id = id === "almarts27-hamster-boss" ? "boss" : id;
  return (
    <picture className={`battle-sprite ${className}`}>
      <source
        media="(prefers-reduced-motion: reduce)"
        srcSet={`/assets/battle/${id}-still.png`}
      />
      <img src={`/assets/battle/${id}.gif`} alt="" />
    </picture>
  );
}
function TeamCheck() {
  return (
    <span className="battle-check" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12l4.5 4.5L19 7"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
function Card({ card }: { card: BattleOwnedCard }) {
  const art = CARD_CATALOG[card.cardId];
  return (
    <img
      className="battle-card-art"
      src={art.cardImageSrc}
      alt={`${art.name} full-art card, printed stats`}
      width={art.width}
      height={art.height}
    />
  );
}
export default function BattleScreen({ view }: { view: View }) {
  const { snapshot: state, adapter } = useBattle();
  const router = useRouter();
  const [draftValue, setDraft] = useState<string[] | null>(null);
  const draft = draftValue ?? [...state.savedTeamIds];
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [loopActor, setLoopActor] = useState<string | null>(null);
  const [summon, setSummon] = useState<{ id: string; nonce: number } | null>(
    null,
  );
  const [showReward, setShowReward] = useState(false);
  const owned = state.ownedCards;
  const battle = state.battle;
  const acting =
    battle?.team.find((c) => c.instanceId === active && c.hp > 0) ??
    battle?.team.find((c) => c.hp > 0);
  const team = (
    battle?.team.map((card) => card.instanceId) ?? state.savedTeamIds
  ).flatMap((id) => {
    const card = owned.find((c) => c.instanceId === id);
    return card ? [card] : [];
  });
  async function perform(action: () => Promise<void>, done?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
      done?.();
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to continue. Try again.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const live = useRef({ battle, adapter, perform });
  useEffect(() => {
    live.current = { battle, adapter, perform };
  });
  useEffect(() => {
    if (!loopActor || view !== "arena") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const current = live.current;
      const fighter = current.battle?.team.find(
        (card) => card.instanceId === loopActor && card.hp > 0,
      );
      if (
        !current.adapter ||
        !fighter ||
        current.battle?.phase !== "choosing"
      ) {
        if (!stopped) setLoopActor(null);
        return;
      }
      const ok = await current.perform(() =>
        current.adapter!.attack({
          battleId: current.battle!.id,
          round: current.battle!.round,
          instanceId: loopActor,
          skillId: fighter.skill.id,
        }),
      );
      if (!stopped && ok) timer = setTimeout(tick, 2400);
      else if (!stopped) setLoopActor(null);
    };
    timer = setTimeout(tick, 1080);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [loopActor, view]);
  useEffect(() => {
    if (!summon) return;
    const timer = setTimeout(() => setSummon(null), 2080);
    return () => clearTimeout(timer);
  }, [summon]);
  useEffect(() => {
    if (
      view !== "arena" ||
      battle?.phase !== "won" ||
      battle.reward?.status === "granted"
    )
      return;
    playSoundOnce("victory", "raid:" + battle.id);
    const timer = setTimeout(() => setShowReward(true), 0);
    return () => clearTimeout(timer);
  }, [view, battle?.id, battle?.phase, battle?.reward?.status]);
  function switchCharacter(instanceId: string) {
    setLoopActor(null);
    setActive(instanceId);
    setSummon((current) => ({
      id: instanceId,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }
  async function challenge() {
    const issue = teamIssue(state.savedTeamIds, owned, state.minimumTeamSize);
    if (issue) {
      router.push(`/battle/team?attention=${encodeURIComponent(issue)}`);
      return;
    }
    if (!adapter) {
      router.push("/battle/arena");
      return;
    }
    await perform(
      () => adapter.startRaid([...state.savedTeamIds]),
      () => router.push("/battle/arena"),
    );
  }
  const notice = (
    <div className="battle-notice" role="status" aria-live="polite">
      {message || state.error || (state.loading ? "Loading your cards…" : "")}
    </div>
  );
  if (view === "quick-match")
    return (
      <section className="battle-screen battle-unavailable">
        <Link
          className="battle-back"
          href="/battle"
          aria-label="Back to Battle"
        >
          ‹
        </Link>
        <h1>Quick Match</h1>
        <img src="/assets/battle/quick-match.png" alt="Pikachu versus Gengar" />
        <h2>Matchmaking unavailable</h2>
        <p>Player battles are coming later.</p>
        <Link className="battle-yellow" href="/battle">
          Back to Battle
        </Link>
      </section>
    );
  if (view === "menu")
    return (
      <section className="battle-screen battle-menu">
        <h1>Battle</h1>
        <section
          className="battle-panel battle-quick"
          aria-label="Quick Match. Battle a random player."
        >
          <img
            src="/assets/battle/quick-match.png"
            alt="Quick Match. Battle a random player. Pikachu versus Gengar."
          />
          <Link
            className="battle-yellow"
            href="/battle/pvp"
            aria-description="Player battle, three versus three with a card stake"
          >
            <span className="battle-button-label">Find Match</span>
          </Link>
        </section>
        <section
          className="battle-panel battle-daily"
          aria-label="Daily Boss. Almarts27 Hamster. First clear reward."
        >
          <img
            src="/assets/battle/daily-boss.png"
            alt="Daily Boss: Almarts27 Hamster on a rainbow unicorn. Four-star first clear reward card."
          />
          <button
            className="battle-yellow"
            onClick={challenge}
            disabled={busy || state.loading}
          >
            <span className="battle-button-label">
              {busy ? "Opening…" : "Challenge Boss"}
            </span>
          </button>
        </section>
        {notice}
        <Link className="battle-edit-link" href="/battle/team">
          <span className="battle-button-label">Edit Team</span>
        </Link>
      </section>
    );
  if (view === "team")
    return (
      <section className="battle-screen battle-editor">
        <div className="battle-editor-heading">
          <Link
            className="battle-back"
            href="/battle"
            aria-label="Back to Battle"
          >
            ‹
          </Link>
          <div>
            <h1>Edit Team</h1>
            <p>Choose up to 3 cards.</p>
          </div>
        </div>
        <p className="battle-count" aria-live="polite">
          {draft.length} / 3 selected
        </p>
        <div className="battle-slots">
          {[0, 1, 2].map((i) => {
            const card = owned.find((c) => c.instanceId === draft[i]);
            return card ? (
              <button
                key={i}
                aria-label={`Remove ${CARD_CATALOG[card.cardId].name}`}
                className="battle-selected-card"
                onClick={() =>
                  setDraft(draft.filter((id) => id !== card.instanceId))
                }
              >
                <Card card={card} />
                <TeamCheck />
              </button>
            ) : draft[i] ? (
              <button
                key={i}
                className="battle-empty-slot"
                aria-label="Remove unavailable card"
                onClick={() => setDraft(draft.filter((id) => id !== draft[i]))}
              >
                <span>×</span>
                <small>Unavailable</small>
              </button>
            ) : (
              <div
                key={i}
                className="battle-empty-slot"
                aria-label={`Empty team slot ${i + 1}`}
              >
                <span>+</span>
              </div>
            );
          })}
        </div>
        <div className="battle-rooftop-space" />
        <section className="battle-picker">
          <h2>Your Cards</h2>
          {!state.loading && !owned.length ? (
            <div className="battle-empty">
              <strong>No owned cards available</strong>
              <p>Your collected cards will appear here.</p>
              <Link href="/collection">Open Collection →</Link>
            </div>
          ) : (
            <div className="battle-card-tray" aria-label="Your owned cards">
              {owned.map((card) => (
                <button
                  key={card.instanceId}
                  className={
                    draft.includes(card.instanceId)
                      ? "battle-selected-card"
                      : ""
                  }
                  aria-label={`${CARD_CATALOG[card.cardId].name}${!eligible(card) ? ": " + (card.lockedByListing ? "Locked by Market listing" : card.ineligibleReason || "Unavailable for raids") : ""}`}
                  aria-pressed={draft.includes(card.instanceId)}
                  disabled={!eligible(card) && !draft.includes(card.instanceId)}
                  onClick={() => {
                    if (draft.length === 3 && !draft.includes(card.instanceId))
                      setMessage("Team full. Remove a card first.");
                    else setMessage("");
                    setDraft(toggleTeam(draft, card));
                  }}
                >
                  <Card card={card} />
                  {draft.includes(card.instanceId) ? (
                    <TeamCheck />
                  ) : !eligible(card) ? (
                    <span className="battle-lock">Locked</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {notice}
          <p className="battle-team-hint">
            {teamIssue(draft, owned, state.minimumTeamSize) ||
              "Ready for the Daily Boss."}
          </p>
          <button
            className="battle-yellow battle-save"
            disabled={
              busy ||
              state.loading ||
              !adapter ||
              draft.some(
                (id) =>
                  !owned.some(
                    (card) => card.instanceId === id && eligible(card),
                  ),
              )
            }
            onClick={() =>
              adapter &&
              perform(
                () => adapter.saveTeam(draft),
                () => router.push("/battle"),
              )
            }
          >
            {busy ? "Saving…" : "Save Team"}
          </button>
          {!adapter && (
            <p className="battle-integration-note">Team saving unavailable</p>
          )}
        </section>
      </section>
    );
  const canAttack =
    !!adapter && !!acting && battle?.phase === "choosing" && !busy;
  return (
    <section className="battle-screen battle-arena">
      <div className="battle-hud">
        <Link
          href="/battle"
          className="battle-back"
          aria-label="Return to Battle Menu"
        >
          ‹
        </Link>
        <div className="battle-boss-health">
          <strong>Almarts27 Hamster</strong>
          {battle ? (
            <div className="battle-hp-line">
              <progress
                aria-label="Boss HP"
                value={battle.bossHp}
                max={battle.bossMaxHp}
              />
              <span>
                {Math.round(
                  (battle.bossHp / Math.max(1, battle.bossMaxHp)) * 100,
                )}
                %
              </span>
            </div>
          ) : (
            <span>Boss HP unavailable</span>
          )}
        </div>
      </div>
      <div className="battle-stage" ref={stage}>
        <Sprite id="boss" className="battle-boss" />
        <div className="battle-team-sprites">
          {team.map((card) => (
            <div
              key={card.instanceId}
              data-fighter-id={card.instanceId}
              className={`battle-team-sprite ${acting?.instanceId === card.instanceId ? "is-active" : ""}`}
            >
              <Sprite id={card.cardId} />
              {summon?.id === card.instanceId && (
                <img
                  key={summon.nonce}
                  className="battle-switch-summon"
                  src="/assets/battle/summon-sky-drop.gif"
                  alt=""
                />
              )}
            </div>
          ))}
        </div>
        {loopActor &&
          battle?.phase === "choosing" &&
          battle.team.some(
            (fighter) => fighter.instanceId === loopActor && fighter.hp > 0,
          ) &&
          team.some((card) => card.instanceId === loopActor) && (
            <BattleEffects
              key={loopActor}
              stage={stage}
              actorId={loopActor}
              cardId={
                team.find((card) => card.instanceId === loopActor)!.cardId
              }
            />
          )}
      </div>
      <section className="battle-controls">
        <h2>Switch Character</h2>
        <div className="battle-switch-cards">
          {team.map((card) => {
            const fighter = battle?.team.find(
              (c) => c.instanceId === card.instanceId,
            );
            return (
              <button
                key={card.instanceId}
                className={
                  acting?.instanceId === card.instanceId ? "is-active" : ""
                }
                aria-label={`Select ${CARD_CATALOG[card.cardId].name}${fighter ? `, ${fighter.hp} HP, ${fighter.skill.name}` : ""}`}
                aria-pressed={acting?.instanceId === card.instanceId}
                disabled={
                  busy ||
                  battle?.phase !== "choosing" ||
                  !fighter ||
                  fighter.hp <= 0
                }
                onClick={() => switchCharacter(card.instanceId)}
              >
                <Card card={card} />
              </button>
            );
          })}
        </div>
        <div className="battle-round-status" role="status" aria-live="polite">
          {battle ? (
            <>
              <strong>
                Round {battle.round} ·{" "}
                {battle.phase === "won"
                  ? "Victory!"
                  : battle.phase === "lost"
                    ? "Team defeated"
                    : battle.phase === "resolving"
                      ? "Resolving round…"
                      : acting?.skill.name}
              </strong>
              <p>{battle.status}</p>
              {battle.heavyAttackWarning && (
                <p className="battle-warning">⚠ {battle.heavyAttackWarning}</p>
              )}
              {battle.reward && (
                <p>
                  {battle.reward.text} · {battle.reward.status}
                </p>
              )}
            </>
          ) : (
            <>
              <strong>Battle unavailable</strong>
              <p>
                {team.length
                  ? "Raid service is not connected yet."
                  : "Save an eligible team to challenge the boss."}
              </p>
              <Link href="/battle/team">Edit Team →</Link>
            </>
          )}
        </div>
        {notice}
        <button
          className={`battle-yellow battle-attack ${loopActor && battle?.phase === "choosing" ? "is-looping" : ""}`}
          disabled={
            !canAttack ||
            (loopActor === acting?.instanceId && battle?.phase === "choosing")
          }
          onClick={() => {
            if (canAttack && acting) setLoopActor(acting.instanceId);
          }}
        >
          {loopActor && battle?.phase === "choosing"
            ? "Attacking…"
            : busy || battle?.phase === "resolving"
              ? "Resolving…"
              : "Attack"}
        </button>
        {loopActor && battle?.phase === "choosing" && (
          <p className="battle-loop-hint">
            Attacking continuously · tap a card to switch and pause
          </p>
        )}
        {battle?.phase === "won" && (
          <button
            className="battle-yellow battle-reveal-reward"
            onClick={() => setShowReward(true)}
          >
            {battle.reward?.status === "granted"
              ? "View boss reward"
              : "Reveal boss reward"}
          </button>
        )}
        {showReward && battle?.phase === "won" && (
          <BossRewardReveal
            onClose={() => setShowReward(false)}
            onClaim={adapter?.claimReward}
            claimed={battle.reward?.status === "granted"}
            inVault={owned.some(
              (card) => card.cardId === "almarts27-hamster-boss",
            )}
          />
        )}
        {(battle?.phase === "won" || battle?.phase === "lost") && (
          <Link className="battle-result-back" href="/battle">
            Back to Battle
          </Link>
        )}
      </section>
    </section>
  );
}
