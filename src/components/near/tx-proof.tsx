"use client";
import { useEffect, useRef } from "react";
import { useGame, gameUi } from "@/lib/near/game-store";
import { explorerTx } from "@/lib/near/config";
import { TokenIcon } from "../tomo-companion";
export default function TxProof() {
  const { proof } = useGame();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (proof && !dialog.current?.open) dialog.current?.showModal();
    if (!proof) dialog.current?.close();
  }, [proof]);
  if (!proof) return null;
  const pending = proof.phase === "authorizing" || proof.phase === "confirming";
  return (
    <dialog
      ref={dialog}
      className="chain-dialog tx-proof"
      aria-labelledby="tx-title"
      onCancel={() => gameUi.proof(null)}
      onClick={(e) => {
        if (e.target === e.currentTarget) gameUi.proof(null);
      }}
    >
      <div className="chain-dialog-top">
        <span className="chain-kicker">
          <TokenIcon token="near" /> NEAR TESTNET
        </span>
        <button
          className="chain-close"
          aria-label="Close transaction receipt"
          onClick={() => gameUi.proof(null)}
        >
          ×
        </button>
      </div>
      <div
        className={`proof-stamp ${pending ? "is-pending" : ""}`}
        aria-hidden="true"
      >
        {proof.phase === "success" ? "✓" : proof.phase === "failed" ? "!" : "↗"}
      </div>
      <p className="chain-kicker">
        {proof.phase === "success"
          ? "ON-CHAIN RECEIPT"
          : proof.phase === "failed"
            ? "TRANSACTION NEEDS ATTENTION"
            : proof.phase === "authorizing"
              ? "APPROVE IN YOUR WALLET"
              : "WAITING FOR FINALITY"}
      </p>
      <h2 id="tx-title">{proof.title}</h2>
      {proof.detail && <p>{proof.detail}</p>}
      {pending && (
        <p role="status">
          {proof.phase === "authorizing"
            ? "Your wallet will ask you to sign this action."
            : "Checking the final receipt on NEAR…"}
        </p>
      )}
      {proof.error && (
        <p className="chain-error" role="alert">
          {proof.error}
        </p>
      )}
      {proof.hash && (
        <>
          <code className="tx-hash">{proof.hash}</code>
          <a
            className="chain-primary"
            href={explorerTx(proof.hash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on NEAR Explorer ↗
          </a>
        </>
      )}
      <button className="chain-secondary" onClick={() => gameUi.proof(null)}>
        {pending ? "Continue browsing" : "Back to adventure"}
      </button>
    </dialog>
  );
}
