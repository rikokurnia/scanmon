"use client";
import Image from "next/image";
import { useRef, useState, useSyncExternalStore } from "react";
import { getHuntSnapshot, readScans, subscribeHunt } from "@/lib/hunt-progress";
export function TokenIcon({ token }: { token: "near" | "usdc" }) {
  return (
    <Image
      src={`/assets/tokens/${token}.svg`}
      width={22}
      height={22}
      alt={token === "near" ? "NEAR" : "USDC"}
      unoptimized
    />
  );
}
export default function TomoCompanion({ onScan }: { onScan: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"tasks" | "about">("tasks");
  const tasksRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const count = readScans(
    useSyncExternalStore(subscribeHunt, getHuntSnapshot, () => "[]"),
  ).length;
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
      count: 0,
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
                            disabled
                            title="Reward claims open when the agent contract is connected"
                          >
                            Claim
                          </button>
                        ) : battle ? (
                          <button
                            className="task-action"
                            disabled
                            title="Battle is not available in this build"
                          >
                            Soon
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
              <div className="reward-proof">
                <TokenIcon token="near" />
                <p>
                  <strong>No verified payouts yet.</strong> A NEAR receipt will
                  appear here after USDC is sent to you.
                </p>
              </div>
              <p className="preview-notice">
                UI preview · planned rewards · claims not live
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
                <span className="agent-status">Not connected</span>
              </div>
              <div className="agent-balances">
                <section className="agent-balance">
                  <div>
                    <TokenIcon token="usdc" />
                    <span>Agent balance</span>
                    <strong>
                      — <small>USDC</small>
                    </strong>
                  </div>
                  <div
                    className="balance-track"
                    role="img"
                    aria-label="Agent funding balance unavailable"
                  >
                    <span />
                  </div>
                  <p>Waiting for the agent to be funded.</p>
                </section>
                <section className="agent-balance">
                  <div>
                    <TokenIcon token="usdc" />
                    <span>Total distributed</span>
                    <strong>
                      — <small>USDC</small>
                    </strong>
                  </div>
                  <div
                    className="balance-track distributed"
                    role="img"
                    aria-label="Distributed balance unavailable"
                  >
                    <span />
                  </div>
                  <p>Verified payouts will be tracked here.</p>
                </section>
              </div>
              <div className="agent-contract">
                <TokenIcon token="near" />
                <div>
                  <h4>Agent contract · NEAR</h4>
                  <p>Not deployed yet</p>
                </div>
                <span aria-hidden="true">↗</span>
              </div>
              <p className="agent-explainer">
                Tomo will reward completed tasks from a limited USDC balance.
                Every payment will link to its NEAR transaction.
              </p>
              <p className="preview-notice">UI preview · no funds connected</p>
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
