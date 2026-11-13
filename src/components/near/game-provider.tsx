"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { connectMarketAdapter } from "@/app/market/market-store";
import { connectBattleAdapter } from "@/app/battle/battle-store";
import {
  createChainBattleAdapter,
  createChainMarketAdapter,
} from "@/lib/near/adapters";
import {
  refreshGame,
  reconcilePending,
  gameSnapshot,
} from "@/lib/near/game-store";
import { selector } from "@/lib/near/wallet-selector";
import { setCollectionSource } from "@/lib/reveal-collection";
import TxProof from "./tx-proof";
import "./near.css";
import "@near-wallet-selector/modal-ui/styles.css";
setCollectionSource(() => gameSnapshot().cardsRaw);
const PrivyRuntime = dynamic(() => import("./privy-runtime"), { ssr: false });
export default function GameProvider({
  children,
  privyAppId,
}: {
  children: React.ReactNode;
  privyAppId: string;
}) {
  useEffect(() => {
    const stopMarket = connectMarketAdapter(createChainMarketAdapter());
    const stopBattle = connectBattleAdapter(createChainBattleAdapter());
    void refreshGame();
    if (localStorage.getItem("scanmon:wallet-mode") !== "google")
      void selector().catch(() => {
        /* Wallets remain connectable on demand. */
      });
    const sync = () => {
      void refreshGame();
      void reconcilePending();
    };
    const timer = window.setInterval(sync, 30_000);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      stopMarket();
      stopBattle();
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <>
      {privyAppId && <PrivyRuntime appId={privyAppId} />} {children}
      <TxProof />
    </>
  );
}
