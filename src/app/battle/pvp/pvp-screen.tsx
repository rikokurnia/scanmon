"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGame, refreshGame } from "@/lib/near/game-store";
import { GAME_ID } from "@/lib/near/config";
import { view } from "@/lib/near/rpc";
import { CARD_CATALOG, type CardId } from "@/app/collection/card-catalog";
import { pollPvp } from "@/lib/pvp/client";
import { enterPvp, settlePvp, cancelPvp } from "@/lib/pvp/transactions";
import type { PvpRoom, RoomView } from "@/lib/pvp/protocol";
import BossRewardReveal from "../boss-reward-reveal";
import BattleEffects from "../battle-effects";
import "../battle.css";
import "./pvp.css";
function Lock() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        className="pvp-shackle"
        d="M15 21v-7a9 9 0 0 1 18 0v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
      />
      <rect x="9" y="19" width="30" height="25" rx="7" fill="currentColor" />
      <path
        d="M24 28v7"
        stroke="#ffd34e"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Art({ id }: { id: CardId }) {
  return (
    <img src={CARD_CATALOG[id].cardImageSrc} alt={CARD_CATALOG[id].name} />
  );
}
function Sprite({ id, enemy = false }: { id: CardId; enemy?: boolean }) {
  const name = id === "almarts27-hamster-boss" ? "boss" : id;
  return (
    <picture
      className={
        enemy
          ? "battle-sprite battle-boss pvp-opponent-sprite"
          : "battle-sprite"
      }
    >
      <source
        media="(prefers-reduced-motion: reduce)"
        srcSet={"/assets/battle/" + name + "-still.png"}
      />
      <img
        src={"/assets/battle/" + name + ".gif"}
        alt={CARD_CATALOG[id].name}
      />
    </picture>
  );
}
function PvpContent() {
  const game = useGame();
  const account = game.accountId;
  const [username, setUsername] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [stake, setStake] = useState("");
  const [rooms, setRooms] = useState<PvpRoom[]>([]);
  const [roomId, setRoomId] = useState("");
  const [match, setMatch] = useState<RoomView | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [recovery, setRecovery] = useState<PvpRoom | null>(null);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [target, setTarget] = useState("");
  const [reveal, setReveal] = useState(false);
  const [effects, setEffects] = useState(false);
  const round = useRef(1);
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const actionLock = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setUsername(
        account
          ? (localStorage.getItem("scanmon:username:" + account) ?? "")
          : "",
      );
      setRoomId(
        account
          ? (localStorage.getItem("scanmon:pvp-room:" + account) ?? "")
          : "",
      );
      setMatch(null);
      setIds([]);
      setStake("");
      if (account)
        void view<PvpRoom | null>(GAME_ID, "pvp_for_player", {
          account_id: account,
        })
          .then((found) => {
            if (found) {
              setRecovery(found);
              setRoomId(found.id);
              localStorage.setItem("scanmon:pvp-room:" + account, found.id);
            }
          })
          .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [account]);
  const list = useCallback(async () => {
    try {
      setRooms(await view<PvpRoom[]>(GAME_ID, "pvp_rooms"));
    } catch {
      setError("Cannot load open matches. Try Refresh.");
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void list(), 0);
    return () => clearTimeout(timer);
  }, [list]);
  useEffect(() => {
    if (!roomId || !account) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await pollPvp(roomId, account);
        if (cancelled) return;
        setMatch(result);
        setClock(Date.now());
        setError("");
        if (result.battle && result.battle.round > round.current) {
          round.current = result.battle.round;
          setEffects(true);
          if (effectTimer.current) clearTimeout(effectTimer.current);
          effectTimer.current = setTimeout(() => setEffects(false), 1250);
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Connection interrupted. Reconnecting…",
          );
      } finally {
        if (!cancelled) timer = setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (effectTimer.current) clearTimeout(effectTimer.current);
    };
  }, [roomId, account]);
  async function perform(fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to continue. Try again.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const eligible = (game.player?.cards ?? []).filter(
    (c) => !game.player?.locked_ids.includes(c.token_id),
  );
  async function enter(join?: string) {
    if (!account) return;
    await perform(async () => {
      await enterPvp(account, username, ids, stake, join);
      localStorage.setItem(
        "scanmon:username:" + account,
        username.trim().toLowerCase(),
      );
      const found =
        join ??
        (await view<PvpRoom[]>(GAME_ID, "pvp_rooms")).find(
          (r) => r.host.account_id === account && r.host.stake_id === stake,
        )?.id;
      if (!found)
        throw new Error(
          "Escrow confirmed. Refresh matches to reopen your room.",
        );
      localStorage.setItem("scanmon:pvp-room:" + account, found);
      round.current = 1;
      setRoomId(found);
    });
  }
  const room = match?.room;
  const side = room?.host.account_id === account ? 0 : 1;
  const players = room ? [room.host, room.guest] : [];
  const me = players[side];
  const enemy = players[1 - side];
  const battle = match?.battle;
  const actor =
    battle?.teams[side].find((c) => c.tokenId === active && c.hp > 0) ??
    battle?.teams[side].find((c) => c.hp > 0);
  const victim =
    battle?.teams[1 - side].find((c) => c.tokenId === target && c.hp > 0) ??
    battle?.teams[1 - side].find((c) => c.hp > 0);
  const terminal =
    !!match?.certificate ||
    room?.phase === "settled" ||
    room?.phase === "cancelled";
  const won =
    (!!match?.certificate && match.certificate.outcome === account) ||
    room?.winner === account;
  const refund =
    match?.certificate?.outcome === "refund" || room?.phase === "cancelled";
  function leave() {
    setResumeId(roomId);
    if (account && (room?.phase === "settled" || room?.phase === "cancelled"))
      localStorage.removeItem("scanmon:pvp-room:" + account);
    setRoomId("");
    setMatch(null);
    setReveal(false);
    void list();
  }
  if (roomId && room && me) {
    return (
      <section
        className={
          "battle-screen pvp-screen " +
          (room.phase === "active" && !terminal ? "pvp-arena" : "pvp-room")
        }
      >
        <div className="pvp-heading">
          <Link
            href="/battle"
            className="battle-back"
            aria-label="Back to Battle"
          >
            ‹
          </Link>
          <div>
            <h1>
              {terminal
                ? refund
                  ? "Match cancelled"
                  : won
                    ? "Victory!"
                    : "Good battle"
                : enemy
                  ? "3 vs 3"
                  : "Waiting for a challenger"}
            </h1>
            <p>
              @{me.username}
              {enemy ? " vs @" + enemy.username : ""}
            </p>
          </div>
        </div>
        {error && (
          <p className="pvp-error" role="alert">
            {error}
          </p>
        )}
        {room.phase === "waiting" && (
          <>
            <p>
              Room code <strong>{room.id}</strong>
            </p>
            <div className="pvp-escrow-card">
              <Art id={me.card_ids[me.team_ids.indexOf(me.stake_id)]} />
              {!game.proof && (
                <span className="pvp-stake-lock">
                  <Lock />
                </span>
              )}
            </div>
            <p>Your card is locked in escrow.</p>
            <p>A challenger must lock their own stake before battle starts.</p>
            <button
              className="battle-yellow"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await cancelPvp(room.id);
                  leave();
                })
              }
            >
              Cancel & return my card
            </button>
          </>
        )}
        {battle && enemy && !terminal && (
          <>
            <div className="pvp-round">
              Round {battle.round} ·{" "}
              {match.submitted[side]
                ? "Action locked · waiting for opponent"
                : "Choose character and target"}
            </div>
            <div className="pvp-opponent-cards">
              {battle.teams[1 - side].map((card) => (
                <button
                  key={card.tokenId}
                  aria-label={
                    "Target " +
                    CARD_CATALOG[card.cardId].name +
                    ", " +
                    card.hp +
                    " HP"
                  }
                  aria-pressed={victim?.tokenId === card.tokenId}
                  disabled={card.hp === 0 || match.submitted[side]}
                  onClick={() => setTarget(card.tokenId)}
                >
                  <Art id={card.cardId} />
                  <span>
                    {card.hp} / {card.maxHp}
                  </span>
                </button>
              ))}
            </div>
            <div className="battle-stage pvp-stage" ref={stage}>
              {victim && <Sprite id={victim.cardId} enemy />}
              {actor && (
                <div
                  data-fighter-id={actor.tokenId}
                  className="pvp-player-sprite"
                >
                  <Sprite id={actor.cardId} />
                </div>
              )}
              {effects && actor && victim && (
                <BattleEffects
                  key={battle.round}
                  stage={stage}
                  actorId={actor.tokenId}
                  cardId={actor.cardId}
                  enemyCardId={victim.cardId}
                />
              )}
            </div>
            <div className="pvp-player-cards">
              {battle.teams[side].map((card) => (
                <button
                  key={card.tokenId}
                  aria-label={
                    "Select " +
                    CARD_CATALOG[card.cardId].name +
                    ", " +
                    card.hp +
                    " HP"
                  }
                  aria-pressed={actor?.tokenId === card.tokenId}
                  disabled={card.hp === 0 || match.submitted[side]}
                  onClick={() => setActive(card.tokenId)}
                >
                  <Art id={card.cardId} />
                  <span>
                    {card.hp} / {card.maxHp}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="battle-yellow"
              disabled={
                busy ||
                match.submitted[side] ||
                !actor ||
                !victim ||
                battle.phase !== "choosing"
              }
              onClick={() =>
                void perform(async () => {
                  if (actor && victim)
                    setMatch(
                      await pollPvp(room.id, account!, {
                        round: battle.round,
                        actor: actor.tokenId,
                        target: victim.tokenId,
                        skill: "strike",
                      }),
                    );
                })
              }
            >
              {match.submitted[side] ? "Waiting for opponent…" : "Attack"}
            </button>
            <small>
              Reconnect within 90 seconds. A timeout cancels the match and
              returns both stakes.
            </small>
          </>
        )}
        {terminal && (
          <div className="pvp-result">
            <p>
              {refund
                ? "Both stakes will be returned."
                : won
                  ? "You won @" + enemy?.username + "’s staked card."
                  : "Your staked card goes to the winner."}
            </p>
            {match.certificate && (refund || won) && (
              <button
                className="battle-yellow"
                disabled={busy}
                onClick={() =>
                  refund
                    ? void perform(async () => {
                        await settlePvp(room.id, match.certificate!);
                        await refreshGame();
                        setMatch({
                          ...match,
                          room: { ...room, phase: "cancelled" },
                        });
                      })
                    : setReveal(true)
                }
              >
                {refund ? "Return both stakes" : "Unlock victory reward"}
              </button>
            )}
            <button className="pvp-secondary" onClick={leave}>
              Back to PvP lobby
            </button>
          </div>
        )}
        {reveal && won && enemy && (
          <BossRewardReveal
            mode="pvp"
            opponentName={enemy.username}
            rewardCardId={
              enemy.card_ids[enemy.team_ids.indexOf(enemy.stake_id)]
            }
            claimed={room.phase === "settled"}
            inVault={
              game.player?.cards.some((c) => c.token_id === enemy.stake_id) ??
              false
            }
            onClose={() => setReveal(false)}
            onClaim={async () => {
              const fresh = await pollPvp(room.id, account!);
              if (!fresh.certificate)
                throw new Error("Result not ready. Try again.");
              await settlePvp(room.id, fresh.certificate);
              setMatch({
                ...fresh,
                room: { ...fresh.room, phase: "settled", winner: account },
              });
            }}
          />
        )}
        {clock >= Number(room.expires_at) * 1000 && !terminal && (
          <button
            className="pvp-secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await cancelPvp(room.id, true);
                leave();
              })
            }
          >
            Recover escrow after 24h
          </button>
        )}
      </section>
    );
  }
  return (
    <section className="battle-screen pvp-screen pvp-lobby">
      <div className="pvp-heading">
        <Link
          href="/battle"
          className="battle-back"
          aria-label="Back to Battle"
        >
          ‹
        </Link>
        <div>
          <h1>Player Battle</h1>
          <p>3 vs 3 · one card stake each</p>
        </div>
      </div>
      {!account ? (
        <p>Connect your wallet in Settings to play.</p>
      ) : (
        <>
          <label htmlFor="pvp-name">Your player name</label>
          <input
            id="pvp-name"
            value={username}
            maxLength={20}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="hunter_27"
            autoComplete="nickname"
          />
          <p>Choose 3 cards, then tap one selected card to mark your stake.</p>
          <div className="pvp-roster">
            {eligible.map((card) => (
              <div className="pvp-roster-item" key={card.token_id}>
                <button
                  className={
                    stake === card.token_id
                      ? "selected is-staked"
                      : ids.includes(card.token_id)
                        ? "selected"
                        : ""
                  }
                  aria-pressed={ids.includes(card.token_id)}
                  onClick={() => {
                    if (ids.includes(card.token_id)) {
                      setStake(card.token_id);
                    } else if (ids.length < 3) {
                      setIds([...ids, card.token_id]);
                      if (!stake) setStake(card.token_id);
                    }
                  }}
                >
                  <Art id={card.card_id} />
                  <span>
                    {stake === card.token_id
                      ? "Stake"
                      : ids.includes(card.token_id)
                        ? "✓ Team"
                        : "+ Select"}
                  </span>
                </button>
                {ids.includes(card.token_id) && (
                  <button
                    className="pvp-remove"
                    aria-label={"Remove " + CARD_CATALOG[card.card_id].name}
                    onClick={() => {
                      setIds(ids.filter((id) => id !== card.token_id));
                      if (stake === card.token_id) setStake("");
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="pvp-warning">
            The loser gives their staked card to the winner. Both players agree
            by locking their stake. A disconnect timeout returns both cards.
            Unclaimed escrow can be recovered after 24 hours.
          </p>
          <button
            className="battle-yellow"
            disabled={
              busy || !!roomId || ids.length !== 3 || !stake || !username
            }
            onClick={() => void enter()}
          >
            {busy ? "Locking stake…" : "Lock card & create match"}
          </button>
        </>
      )}
      {error && (
        <p className="pvp-error" role="alert">
          {error}
        </p>
      )}
      {roomId && !match && (
        <p role="status">
          Reconnecting to {roomId}…{" "}
          <button className="pvp-secondary" onClick={leave}>
            Return to lobby
          </button>
        </p>
      )}
      {!roomId && resumeId && (
        <button className="pvp-secondary" onClick={() => setRoomId(resumeId)}>
          Resume previous match
        </button>
      )}
      {roomId && !match && recovery && (
        <div>
          <p>
            If the session on this device is unavailable, escrow can still be
            recovered on-chain.
          </p>
          <button
            className="pvp-secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await cancelPvp(recovery.id, recovery.phase !== "waiting");
                setRoomId("");
                setRecovery(null);
                if (account)
                  localStorage.removeItem("scanmon:pvp-room:" + account);
              })
            }
          >
            {recovery.phase === "waiting"
              ? "Cancel waiting match & return card"
              : "Recover escrow after 24h"}
          </button>
        </div>
      )}
      <h2>Find a challenger</h2>
      <input
        aria-label="Search player name or room code"
        placeholder="Player name or room code"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button className="pvp-secondary" onClick={() => void list()}>
        Refresh matches
      </button>
      {rooms
        .filter(
          (r) =>
            r.host.username.includes(search.toLowerCase()) || r.id === search,
        )
        .map((r) => (
          <div className="pvp-open-room" key={r.id}>
            <span>
              <strong>@{r.host.username}</strong>
              <small>
                {r.id} · stake:{" "}
                {
                  CARD_CATALOG[
                    r.host.card_ids[r.host.team_ids.indexOf(r.host.stake_id)]
                  ].name
                }
              </small>
            </span>
            <button
              className="pvp-secondary"
              disabled={
                busy ||
                !account ||
                (r.host.account_id !== account &&
                  (ids.length !== 3 || !stake || !username))
              }
              onClick={() => {
                if (r.host.account_id === account) {
                  setRoomId(r.id);
                  if (account)
                    localStorage.setItem("scanmon:pvp-room:" + account, r.id);
                } else void enter(r.id);
              }}
            >
              {r.host.account_id === account ? "Open" : "Join & lock card"}
            </button>
          </div>
        ))}
      {!rooms.length && (
        <p>No open matches yet. Create one and invite a friend.</p>
      )}
    </section>
  );
}

export default function PvpScreen() {
  const { accountId } = useGame();
  return <PvpContent key={accountId ?? "guest"} />;
}
