"use client";
import { isSoundMuted, subscribeSound, setSoundMuted } from "@/lib/sound";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useGame,
  disconnect,
  faucet,
  refreshGame,
  mergeHistory,
  withdrawUsdc,
} from "@/lib/near/game-store";
import { connectGoogle, connectNearWallet } from "@/lib/near/wallet-selector";
import {
  displayUnits,
  explorerAccount,
  explorerTx,
  IS_MOCK_USDC,
} from "@/lib/near/config";
import type { ChainTx } from "@/lib/near/types";
import { TokenIcon } from "../tomo-companion";
export default function SettingsModal({
  open,
  onClose,
  googleEnabled,
}: {
  open: boolean;
  onClose: () => void;
  googleEnabled: boolean;
}) {
  const game = useGame();
  const muted = useSyncExternalStore(subscribeSound, isSoundMuted, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"account" | "history">("account");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const account = game.accountId;
  async function loadHistory(next?: string) {
    if (!account) return;
    setHistoryLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ account });
      if (next) params.set("cursor", next);
      const res = await fetch(`/api/near/history?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      mergeHistory(data.transactions as ChainTx[]);
      setCursor(data.next);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setHistoryLoading(false);
    }
  }
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function perform(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="chain-dialog settings-dialog"
      aria-labelledby="settings-title"
      onCancel={onClose}
      onToggle={(event) => {
        if (event.newState === "open" && tab === "history") void loadHistory();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="chain-dialog-top">
        <span className="chain-kicker">YOUR ADVENTURE HQ</span>
        <button
          className="chain-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h2 id="settings-title">Settings</h2>
      <button
        className="chain-secondary"
        aria-pressed={muted}
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        onClick={() => setSoundMuted(!muted)}
      >
        {muted ? "Unmute sound" : "Mute sound"}
      </button>
      <div className="settings-tabs" role="tablist" aria-label="Settings tabs">
        {(["account", "history"] as const).map((name) => (
          <button
            key={name}
            role="tab"
            id={`settings-${name}-tab`}
            aria-selected={tab === name}
            aria-controls={`settings-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next = name === "account" ? "history" : "account";
                setTab(next);
                if (next === "history") void loadHistory();
                document.getElementById(`settings-${next}-tab`)?.focus();
              }
            }}
            onClick={() => {
              setTab(name);
              if (name === "history") void loadHistory();
            }}
          >
            {name === "account" ? "Account" : "History"}
          </button>
        ))}
      </div>
      {tab === "account" ? (
        <section
          role="tabpanel"
          id="settings-account"
          aria-labelledby="settings-account-tab"
        >
          <span className="network-pill">
            <i /> NEAR Testnet
          </span>
          {account ? (
            <>
              <div className="connected-wallet">
                <span>CONNECTED WITH {game.walletName}</span>
                <a
                  href={explorerAccount(account)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {account} ↗
                </a>
                <button
                  className="chain-text-button"
                  onClick={() =>
                    void perform(async () => {
                      await navigator.clipboard.writeText(account);
                      setNotice("Account ID copied.");
                    })
                  }
                >
                  Copy account ID
                </button>
              </div>
              <div className="account-balances">
                <div>
                  <TokenIcon token="usdc" />
                  <span>USDC</span>
                  <strong>
                    {game.usdc === null ? "—" : displayUnits(game.usdc)}
                  </strong>
                </div>
              </div>
              {game.player && BigInt(game.player.usdc_credit) > BigInt(0) && (
                <button
                  className="chain-secondary"
                  disabled={busy}
                  onClick={() => void perform(withdrawUsdc)}
                >
                  Withdraw {displayUnits(game.player.usdc_credit)} USDC from
                  sales
                </button>
              )}
              <div className="wallet-actions">
                <button
                  className="chain-secondary"
                  disabled={busy || game.loading}
                  onClick={() => void perform(refreshGame)}
                >
                  ↻ Refresh balances
                </button>
                <button
                  className="chain-secondary"
                  disabled={busy}
                  onClick={() => void perform(disconnect)}
                >
                  Disconnect
                </button>
              </div>
              {IS_MOCK_USDC && (
                <button
                  className="chain-primary"
                  disabled={busy || game.player?.starter_claimed}
                  onClick={() => void perform(faucet)}
                >
                  {busy
                    ? "Working…"
                    : game.player?.starter_claimed
                      ? "25 USDC claimed"
                      : "Get 25 USDC"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="wallet-welcome">
                <TokenIcon token="near" />
                <h3>Your little on-chain world.</h3>
                <p>
                  Connect to mint discoveries, trade with Koban, and claim
                  Tomo’s rewards.
                </p>
              </div>
              {googleEnabled && (
                <button
                  className="chain-primary google-connect"
                  disabled={game.connecting || !game.googleReady}
                  onClick={() => {
                    onClose();
                    connectGoogle();
                  }}
                >
                  <Image
                    src="/assets/icons/google.png"
                    width={23}
                    height={23}
                    alt=""
                    unoptimized
                  />{" "}
                  Continue with Google
                </button>
              )}
              <button
                className="chain-secondary"
                disabled={game.connecting}
                onClick={() => {
                  onClose();
                  void connectNearWallet();
                }}
              >
                {game.connecting ? "Opening wallets…" : "Connect NEAR wallet"}
              </button>
              <p className="chain-fine">
                Google uses Privy’s NEAR wallet. HERE, Meteor and MyNearWallet
                are available through Wallet Selector.
              </p>
            </>
          )}
        </section>
      ) : (
        <section
          role="tabpanel"
          id="settings-history"
          aria-labelledby="settings-history-tab"
        >
          <p className="history-intro">
            Your account’s on-chain activity. Each receipt opens directly in
            NEAR Explorer.
          </p>
          {!account ? (
            <p className="chain-empty">Connect a wallet to see your history.</p>
          ) : (
            <>
              <div className="history-toolbar">
                <a
                  href={explorerAccount(account)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Full account history ↗
                </a>
                <button
                  disabled={historyLoading}
                  className="chain-text-button"
                  onClick={() => void loadHistory()}
                >
                  Refresh
                </button>
              </div>
              {!game.history.length && (
                <p className="chain-empty">
                  {historyLoading
                    ? "Loading chain history…"
                    : "No transactions yet. Your first discovery starts here."}
                </p>
              )}
              <ul className="tx-list">
                {game.history.map((tx) => (
                  <li key={tx.hash}>
                    <div>
                      <span className={`tx-kind tx-${tx.kind}`}>{tx.kind}</span>
                      <span className={`tx-status status-${tx.status}`}>
                        {tx.status}
                      </span>
                    </div>
                    <strong>{tx.title}</strong>
                    <time dateTime={new Date(tx.timestamp).toISOString()}>
                      {new Date(tx.timestamp).toLocaleString()}
                    </time>
                    <a
                      href={explorerTx(tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <TokenIcon token="near" /> View on NEAR Explorer ↗
                    </a>
                  </li>
                ))}
              </ul>
              {cursor && (
                <button
                  className="chain-secondary"
                  disabled={historyLoading}
                  onClick={() => void loadHistory(cursor)}
                >
                  {historyLoading ? "Loading…" : "Load older transactions"}
                </button>
              )}
            </>
          )}
        </section>
      )}
      {(notice || game.error) && (
        <p className="chain-error" role="status">
          {notice || game.error}
        </p>
      )}
    </dialog>
  );
}
