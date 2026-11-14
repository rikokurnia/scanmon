"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GAME_ID } from "@/lib/near/config";
import { useGame } from "@/lib/near/game-store";
import type { ChainTx } from "@/lib/near/types";
import type { ScanResult } from "@/lib/scan-result";
import CollectionScreen from "./collection-screen";
import {
  collectionSnapshot,
  readCollection,
  subscribeCollection,
} from "@/lib/reveal-collection";

function isBossResult(result: ScanResult): boolean {
  return (
    result.barcode.startsWith("boss:") ||
    result.cardId === "almarts27-hamster-boss"
  );
}

function resolveCardTxHashes(
  results: ScanResult[],
  history: ChainTx[],
): Map<string, string> {
  const map = new Map<string, string>();
  const usedHashes = new Set<string>();
  const successTxs = history.filter((tx) => tx.status === "success");

  // Pass 1: exact matches (boss reward, or mint with barcode in detail)
  for (const result of results) {
    if (isBossResult(result)) {
      const bossTx = successTxs.find((tx) => tx.kind === "boss");
      if (bossTx) {
        map.set(result.id, bossTx.hash);
        usedHashes.add(bossTx.hash);
      }
      continue;
    }

    const exactMint = successTxs.find(
      (tx) => tx.kind === "mint" && tx.detail?.includes(result.barcode),
    );
    if (exactMint) {
      map.set(result.id, exactMint.hash);
      usedHashes.add(exactMint.hash);
    }
  }

  // Pass 2: fallback to on-chain mint/starter txs (e.g. from /api/near/history where detail is omitted)
  const fallbackTxs = successTxs.filter(
    (tx) =>
      !usedHashes.has(tx.hash) &&
      (tx.kind === "mint" || tx.kind === "faucet") &&
      (!GAME_ID || !tx.receiverId || tx.receiverId === GAME_ID),
  );
  let fallbackIdx = 0;
  for (const result of results) {
    if (map.has(result.id) || isBossResult(result)) continue;
    const tx = fallbackTxs[fallbackIdx];
    if (!tx) break;
    map.set(result.id, tx.hash);
    fallbackIdx += 1;
  }

  return map;
}

export default function CollectionPage() {
  const game = useGame();
  const [indexerHistory, setIndexerHistory] = useState<{
    accountId: string;
    rows: ChainTx[];
  } | null>(null);

  const snapshot = useSyncExternalStore(
    subscribeCollection,
    collectionSnapshot,
    () => "[]",
  );

  useEffect(() => {
    const accountId = game.accountId;
    if (!accountId) return;
    let cancelled = false;

    fetch(`/api/near/history?account=${encodeURIComponent(accountId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { transactions?: ChainTx[] } | null) => {
        if (cancelled || !body || !Array.isArray(body.transactions)) return;
        setIndexerHistory({ accountId, rows: body.transactions });
      })
      .catch(() => {
        // Ignore transient indexer failures; local game.history remains available.
      });

    return () => {
      cancelled = true;
    };
  }, [game.accountId]);

  const mergedHistory = useMemo(() => {
    const seen = new Set<string>();
    const combined: ChainTx[] = [];
    for (const tx of game.history) {
      if (seen.has(tx.hash)) continue;
      seen.add(tx.hash);
      combined.push(tx);
    }
    if (indexerHistory && indexerHistory.accountId === game.accountId) {
      for (const tx of indexerHistory.rows) {
        if (seen.has(tx.hash)) continue;
        seen.add(tx.hash);
        combined.push(tx);
      }
    }
    return combined;
  }, [game.accountId, game.history, indexerHistory]);

  const ownedResults = useMemo(() => readCollection(snapshot), [snapshot]);
  const txHashMap = useMemo(
    () => resolveCardTxHashes(ownedResults, mergedHistory),
    [ownedResults, mergedHistory],
  );

  return (
    <CollectionScreen
      cards={ownedResults.map((result) => ({
        instanceId: result.id,
        cardId: result.cardId,
        txHash: txHashMap.get(result.id),
      }))}
      isLoading={game.loading}
    />
  );
}
