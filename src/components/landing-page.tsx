"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { isSoundMuted, setSoundMuted, subscribeSound } from "@/lib/sound";
import { explorerAccount } from "@/lib/near/config";
import "./landing.css";

type Account = { name: string; id: string; kind: string; purpose: string };
const steps = [
  {
    title: "Sign In",
    icon: "icons/settings.png",
    text: (
      <>
        Open <b>Settings → Account</b>. Connect a wallet or choose{" "}
        <b>Continue with Google</b> through Privy’s embedded wallet flow. No
        seed phrase entry is required for Google sign-in.
      </>
    ),
  },
  {
    title: "Scan & Mint",
    icon: "icons/scan.png",
    text: (
      <>
        Open <b>Scan</b> (/scan) and scan a physical product barcode. Peel the
        foil to reveal the monster. The card is minted on NEAR using{" "}
        <b>NEP-245</b>. The confirmation links to the receipt on{" "}
        <b>NEAR Explorer</b>.
      </>
    ),
  },
  {
    title: "Complete a Tomo Quest",
    icon: "companion/tomo-near-still.png",
    text: (
      <>
        Open <b>Tomo → Tasks</b> in /scan. Complete a mission and tap{" "}
        <b>Claim</b> to receive the USDC reward from Tomo’s agent wallet.
      </>
    ),
  },
  {
    title: "View Your Collection",
    icon: "icons/collection.png",
    text: (
      <>
        Open <b>Collection</b> (/collection) to see cards earned through
        minting, buying, or winning. Check their stats and on-chain ownership
        records.
      </>
    ),
  },
  {
    title: "Trade with Koban",
    icon: "icons/market.png",
    text: (
      <>
        Open <b>Market</b> (/market). Choose <b>Buy</b> or <b>Sell</b>, select a
        card, and negotiate live with Koban. Koban uses his own agent wallet and
        USDC balance.
      </>
    ),
  },
  {
    title: "Battle",
    icon: "icons/battle.png",
    text: (
      <>
        <b>PvE Daily Boss</b> (/battle/arena): Build a three-card team, defeat
        the boss, and tap <b>Claim boss card</b>. <b>PvP 3v3 Stake</b> (/battle/pvp):
        Create or join a room using a room code or a friend’s username. Choose
        three team cards and mark one as the stake. The staked cards enter
        on-chain escrow, the teams auto-battle, and the winner can claim the
        opponent’s staked card.
      </>
    ),
  },
  {
    title: "Verify Your Activity",
    icon: "icons/help.png",
    text: (
      <>
        After a mint, Tomo claim, market trade, raid loot claim, or PvP escrow
        or claim, use <b>View on NEAR Explorer ↗</b> to open the receipt. Review
        previous transactions in <b>Settings → History</b>.
      </>
    ),
  },
];

export default function LandingPage({ accounts }: { accounts: Account[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<"guide" | "about">("guide");
  const muted = useSyncExternalStore(subscribeSound, isSoundMuted, () => false);
  function open(next: "guide" | "about") {
    setPanel(next);
    dialog.current?.showModal();
  }
  return (
    <main className="forest-landing">
      <div className="landing-composition">
        <div className="woodland-title">
          <p>A WORLD UNSEEN</p>
          <h1>
            scan<span>Mon</span>
          </h1>
          <p>BEYOND THE BARCODE</p>
        </div>
        <nav
          className="landing-menu"
          aria-label="Welcome"
          onClickCapture={(event) => {
            const target =
              event.target instanceof Element
                ? event.target.closest(".forest-plaque")
                : null;
            if (
              target &&
              !window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ) {
              target.animate(
                [
                  {
                    transform: "translateY(3px) scale(.97)",
                    filter: "brightness(1.35)",
                  },
                  {
                    transform: "translateY(0) scale(1)",
                    filter: "brightness(1)",
                  },
                ],
                { duration: 260, easing: "ease-out" },
              );
            }
          }}
        >
          <Link href="/scan" className="forest-plaque">
            <span>Start Game</span>
          </Link>
          <button className="forest-plaque" onClick={() => open("guide")}>
            <span>How to Play</span>
          </button>
          <button className="forest-plaque" onClick={() => open("about")}>
            <span>About</span>
          </button>
        </nav>
      </div>
      <button
        className="landing-sound"
        onClick={() => setSoundMuted(!muted)}
        aria-pressed={!muted}
        aria-label={muted ? "Enable sound" : "Mute sound"}
      >
        <span aria-hidden="true">{muted ? "♫ ×" : "♫"}</span> Sound{" "}
        {muted ? "off" : "on"}
      </button>
      <dialog
        ref={dialog}
        className="woodland-dialog"
        aria-labelledby="woodland-dialog-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <header className="woodland-dialog-header">
          <div>
            <p className="woodland-kicker">THE POCKET FIELD GUIDE</p>
            <h2 id="woodland-dialog-title">
              {panel === "guide" ? "How to Play" : "About scanMon"}
            </h2>
          </div>
          <button
            className="woodland-close"
            autoFocus
            aria-label="Close dialog"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="woodland-dialog-scroll" tabIndex={0}>
          {panel === "guide" ? (
            <ol className="field-guide">
              {steps.map((step, index) => (
                <li key={step.title}>
                  {/* Existing Pocket Arcade artwork shares the game's visual language. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/assets/${step.icon}`}
                    alt=""
                    width={48}
                    height={48}
                  />
                  <div>
                    <h3>
                      <span>{index + 1}.</span> {step.title}
                    </h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="about-forest">
              <p className="about-intro">
                A little wonder in the everyday. scanMon turns the barcode on a
                physical product into a monster to discover, collect, trade, and
                take into battle. Meet Tomo, your quest companion, and Koban,
                the woodland merchant.
              </p>
              <h3>Why NEAR</h3>
              <p>
                Your cards have <b>NEP-245 on-chain ownership</b>. USDC powers
                quest rewards and negotiated trades, with{" "}
                <b>separate wallets and budgets for Tomo and Koban</b>. Raid
                victories unlock claimable loot; PvP stakes enter{" "}
                <b>on-chain card escrow</b> until the winner claims. Minting,
                rewards, trades, loot, and escrow actions provide verifiable
                receipts, with previous activity in Settings → History.
              </p>
              <p className="network-note">
                Currently on NEAR Testnet · Rewards and trades use a test USDC
                token.
              </p>
              <h3>Deployed Contracts</h3>
              <div className="deployed-accounts">
                {accounts.map((account) => (
                  <article key={account.id}>
                    <div className="account-heading">
                      <h4>{account.name}</h4>
                      <span>{account.kind} · Testnet</span>
                    </div>
                    <a
                      href={explorerAccount(account.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {account.id} ↗
                      <span className="sr-only"> — View on NEAR Explorer</span>
                    </a>
                    <p>{account.purpose}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </dialog>
    </main>
  );
}
