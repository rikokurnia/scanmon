"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useGame, claimTask } from "@/lib/near/game-store";
import {
  displayUnits,
  explorerAccount,
  explorerTx,
  GAME_ID,
} from "@/lib/near/config";
export function TokenIcon({ token }: { token: "near" | "usdc" }) {
  return (
    <Image
      src={`/assets/tokens/${token}-original.png`}
      className="token-logo"
      width={22}
      height={22}
      alt={token === "near" ? "NEAR" : "USDC"}
      unoptimized
    />
  );
}
export default function TomoCompanion({ onScan }: { onScan: () => void }) {
  const router = useRouter();
  const game = useGame();
  const firstWin = game.player?.first_win;
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState("");
  const lastReward = game.history.find(
    (tx) => tx.kind === "quest" && tx.status === "success",
  );
  async function claim(id: string) {
    if (claiming) return;
    setClaiming(id);
    setClaimError("");
    try {
      await claimTask(id);
    } catch (error) {
      setClaimError(
        error instanceof Error ? error.message : "Claim failed. Try again.",
      );
    } finally {
      setClaiming(null);
    }
  }
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"tasks" | "about">("tasks");
  const tasksRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const count = game.player?.discoveries ?? 0;
  const tasks = [
    {
      id: "first",
      title: "Scan your first item",
      goal: 1,
      count: Math.min(count, 1),
      reward: 1,
    },
    { id: "three", title: "Scan 3 different items", goal: 3, count, reward: 2 },
    {
      id: "battle",
      title: "Win your first battle",
      goal: 1,
      count: firstWin ? 1 : 0,
      reward: 2,
    },
  ];
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <aside className="tomo-layer" aria-label="Tomo AI companion">
      {open && (
        <section
          className="tomo-board"
          aria-label="Tomo’s task board"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div
            className="board-tabs"
            role="tablist"
            aria-label="Companion menu"
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "tasks"
                    : e.key === "End"
                      ? "about"
                      : tab === "tasks"
                        ? "about"
                        : "tasks";
                setTab(next);
                (next === "tasks" ? tasksRef : aboutRef).current?.focus();
              }
            }}
          >
            <button
              ref={tasksRef}
              id="tomo-tasks-tab"
              role="tab"
              aria-controls="tomo-tasks"
              aria-selected={tab === "tasks"}
              tabIndex={tab === "tasks" ? 0 : -1}
              onClick={() => setTab("tasks")}
            >
              Tasks
            </button>
            <button
              ref={aboutRef}
              id="tomo-about-tab"
              role="tab"
              aria-controls="tomo-about"
              aria-selected={tab === "about"}
              tabIndex={tab === "about" ? 0 : -1}
              onClick={() => setTab("about")}
            >
              About
            </button>
            <button
              className="board-close"
              aria-label="Close Tomo"
              onClick={close}
            >
              ×
            </button>
          </div>
          {tab === "tasks" ? (
            <div
              id="tomo-tasks"
              role="tabpanel"
              aria-labelledby="tomo-tasks-tab"
              tabIndex={0}
            >
              <p className="board-intro">
                A little adventure. A little reward.
              </p>
              <div className="task-list">
                {tasks.map((task) => {
                  const complete = task.count >= task.goal;
                  const claimed = game.player?.claims.includes(task.id);
                  const battle = task.id === "battle";
                  return (
                    <article
                      className={`hunt-task ${complete ? "task-complete" : ""}`}
                      key={task.id}
                    >
                      <h3>
                        {task.title}
                        {task.goal === 1 && !complete && (
                          <span className="task-count">
                            {task.count}/{task.goal}
                          </span>
                        )}
                        {complete && (
                          <span className="task-check" aria-label="Completed">
                            ✓
                          </span>
                        )}
                      </h3>
                      {task.goal > 1 && (
                        <div className="task-progress">
                          <progress
                            aria-label={task.title}
                            value={task.count}
                            max={task.goal}
                          />
                          <span>
                            {task.count}/{task.goal}
                          </span>
                        </div>
                      )}
                      <div className="task-bottom">
                        <span className="task-reward">
                          <TokenIcon token="usdc" />+{task.reward}{" "}
                          <span>USDC</span>
                        </span>
                        {complete ? (
                          <button
                            className="task-action claim"
                            disabled={
                              !!claiming ||
                              claimed ||
                              !game.accountId ||
                              !game.config ||
                              BigInt(game.config.tomo_budget) <
                                BigInt(task.reward * 1_000_000)
                            }
                            onClick={() => void claim(task.id)}
                          >
                            {claimed
                              ? "Claimed ✓"
                              : claiming === task.id
                                ? "Claiming…"
                                : "Claim"}
                          </button>
                        ) : battle ? (
                          <button
                            className="task-action"
                            onClick={() => {
                              close();
                              router.push("/battle");
                            }}
                          >
                            Go to Battle
                          </button>
                        ) : (
                          <button
                            className="task-action"
                            onClick={() => {
                              close();
                              onScan();
                            }}
                          >
                            Go to Scan
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {claimError && (
                <p className="chain-error" role="alert">
                  {claimError}
                </p>
              )}
              <div className="reward-proof">
                <TokenIcon token="near" />
                <p>
                  {lastReward ? (
                    <a
                      href={explorerTx(lastReward.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View your latest reward on NEAR Explorer ↗
                    </a>
                  ) : (
                    <>
                      <strong>No verified payouts yet.</strong> Your receipt
                      appears after a successful payout.
                    </>
                  )}
                </p>
              </div>
              <p className="preview-notice">
                {game.accountId
                  ? "Task progress is verified by the game contract."
                  : "Connect in Settings. Mint discoveries to complete tasks."}
              </p>
            </div>
          ) : (
            <div
              id="tomo-about"
              role="tabpanel"
              aria-labelledby="tomo-about-tab"
              tabIndex={0}
            >
              <div className="tomo-bio">
                <span className="tomo-bio-icon">
                  <TokenIcon token="near" />
                </span>
                <div>
                  <h3>Meet Tomo</h3>
                  <p>Your little NEAR companion.</p>
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
                        ? displayUnits(game.config.tomo_budget)
                        : "—"}{" "}
                      <small>USDC</small>
                    </strong>
                  </div>
                  <div
                    className="balance-track"
                    role="img"
                    aria-label="Agent funding is read from the game contract"
                  >
                    <span />
                  </div>
                  <p>
                    {game.config && BigInt(game.config.tomo_budget) > BigInt(0)
                      ? "Finite USDC budget deposited on-chain."
                      : "Rewards pause when the budget is empty."}
                  </p>
                </section>
                <section className="agent-balance">
                  <div>
                    <TokenIcon token="usdc" />
                    <span>Total distributed</span>
                    <strong>
                      {game.config
                        ? displayUnits(game.config.distributed)
                        : "—"}{" "}
                      <small>USDC</small>
                    </strong>
                  </div>
                  <div
                    className="balance-track distributed"
                    role="img"
                    aria-label="Confirmed USDC distributed on-chain"
                  >
                    <span />
                  </div>
                  <p>Verified payouts will be tracked here.</p>
                </section>
              </div>
              <div className="agent-contract">
                <TokenIcon token="near" />
                <div>
                  <h4>Agent account · NEAR</h4>
                  <p>
                    {game.config ? (
                      <a
                        href={explorerAccount(game.config.tomo_account_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {game.config.tomo_account_id} ↗
                      </a>
                    ) : (
                      "Reading contract…"
                    )}
                  </p>
                </div>
                <span aria-hidden="true">↗</span>
              </div>
              <p className="agent-explainer">
                Tomo rewards completed tasks from a limited USDC balance. Every
                payment will link to its NEAR transaction.
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
            </div>
          )}
        </section>
      )}
      <button
        ref={trigger}
        className={`tomo-trigger ${open ? "tomo-open" : ""}`}
        aria-label={open ? "Close Tomo tasks" : "Open Tomo tasks"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {!open && (
          <span className="tomo-bubble">
            Tasks <span aria-hidden="true">✦</span>
          </span>
        )}
        <Image
          className="tomo-animated"
          src="/assets/companion/tomo-near-wave.gif"
          alt="Tomo, your NEAR companion"
          width={112}
          height={112}
          unoptimized
        />
        <Image
          className="tomo-still"
          src="/assets/companion/tomo-near-still.png"
          alt="Tomo, your NEAR companion"
          width={112}
          height={112}
          unoptimized
        />
      </button>
    </aside>
  );
}
