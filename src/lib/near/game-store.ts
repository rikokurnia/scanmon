"use client";
import { useSyncExternalStore } from "react";
import { GAME_ID, USDC_ID, units, IS_MOCK_USDC } from "./config";
import {
  SettlementError,
  assertSucceeded,
  finalTransaction,
  rpc,
  view,
  type Outcome,
} from "./rpc";
import type {
  Call,
  ChainCard,
  ChainConfig,
  ChainListing,
  ChainPlayer,
  ChainTx,
  ShopItem,
  TxKind,
} from "./types";
import type { ScanResult } from "../scan-result";
import type { BattleState } from "@/app/battle/battle-interface";
import {
  newRaid,
  raidTurn,
  restoreRaid,
  type RaidSession,
} from "@/app/battle/raid-engine";

export interface Proof {
  phase: "authorizing" | "confirming" | "success" | "failed";
  title: string;
  detail?: string;
  hash?: string;
  error?: string;
}
export interface GameSnapshot {
  accountId: string | null;
  walletName: string | null;
  connecting: boolean;
  googleReady: boolean;
  loading: boolean;
  error: string | null;
  near: string | null;
  usdc: string | null;
  usdcRegistered: boolean;
  player: ChainPlayer | null;
  config: ChainConfig | null;
  shop: ShopItem[];
  listings: ChainListing[];
  history: ChainTx[];
  proof: Proof | null;
  cardsRaw: string;
  team: string[];
  raidSession: RaidSession | null;
}
const initial: GameSnapshot = {
  accountId: null,
  walletName: null,
  connecting: false,
  googleReady: false,
  loading: false,
  error: null,
  near: null,
  usdc: null,
  usdcRegistered: false,
  player: null,
  config: null,
  shop: [],
  listings: [],
  history: [],
  proof: null,
  cardsRaw: "[]",
  team: [],
  raidSession: null,
};
let state: GameSnapshot = initial;
const listeners = new Set<() => void>();
export const gameSnapshot = () => state;
export const subscribeGame = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
function publish(next: Partial<GameSnapshot>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("scanmon:collection-changed"));
}
export function useGame() {
  return useSyncExternalStore(subscribeGame, gameSnapshot, () => initial);
}
export const gameUi = {
  proof: (proof: Proof | null) => publish({ proof }),
  error: (error: string | null) => publish({ error }),
  connecting: (connecting: boolean) => publish({ connecting }),
  googleReady: (googleReady: boolean) => publish({ googleReady }),
};
type Send = (call: Call) => Promise<Outcome | undefined>;
let sender: Send | null = null;
let disconnectWallet: (() => Promise<void>) | null = null;
let busy = false;
let refreshSequence = 0;
let refreshPromise: Promise<void> | null = null;
const historyKey = (account: string) => `scanmon:testnet:${account}:history:v2`;
const raidKey = (account: string) =>
  `scanmon:testnet:${GAME_ID}:${account}:raid:v3`;
function loadRaid(account: string) {
  try {
    return restoreRaid(localStorage.getItem(raidKey(account)));
  } catch {
    return null;
  }
}
function persistRaid(session: RaidSession) {
  if (!state.accountId) throw new Error("Connect a wallet first.");
  localStorage.setItem(raidKey(state.accountId), JSON.stringify(session));
  publish({ raidSession: session });
}
const teamKey = (account: string) => `scanmon:testnet:${account}:team:v2`;
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function saveHistory() {
  if (state.accountId)
    try {
      localStorage.setItem(
        historyKey(state.accountId),
        JSON.stringify(state.history),
      );
    } catch {
      /* RPC and indexer remain authoritative. */
    }
}
export function mergeHistory(rows: ChainTx[]) {
  const history = [
    ...new Map(
      [
        ...rows.filter((row) => row.accountId === state.accountId),
        ...state.history,
      ].map((tx) => [tx.hash, tx]),
    ).values(),
  ].sort((a, b) => b.timestamp - a.timestamp);
  publish({ history });
  saveHistory();
}
function record(tx: ChainTx) {
  if (tx.accountId !== state.accountId) {
    const history = stored<ChainTx[]>(historyKey(tx.accountId), []);
    try {
      localStorage.setItem(
        historyKey(tx.accountId),
        JSON.stringify([tx, ...history.filter((row) => row.hash !== tx.hash)]),
      );
    } catch {
      /* History can be reconstructed from the indexer. */
    }
    return;
  }
  const history = [tx, ...state.history.filter((x) => x.hash !== tx.hash)];
  publish({ history });
  saveHistory();
}
export function setWallet(
  accountId: string | null,
  walletName: string | null,
  send: Send | null,
  disconnect: (() => Promise<void>) | null,
) {
  if (state.accountId === accountId) {
    sender = send;
    disconnectWallet = disconnect;
    publish({ walletName, connecting: false });
    return;
  }
  refreshSequence++;
  sender = send;
  disconnectWallet = disconnect;
  const history = accountId ? stored<ChainTx[]>(historyKey(accountId), []) : [];
  const team = accountId ? stored<string[]>(teamKey(accountId), []) : [];
  publish({
    accountId,
    walletName,
    connecting: false,
    player: null,
    near: null,
    usdc: null,
    usdcRegistered: false,
    cardsRaw: "[]",
    history,
    team,
    raidSession: accountId ? loadRaid(accountId) : null,
    error: null,
    proof: null,
    loading: !!accountId,
  });
  void refreshGame();
}
export async function disconnect() {
  await disconnectWallet?.();
  setWallet(null, null, null, null);
}
export async function refreshGame() {
  // Concurrent UI requests share one read; account switches invalidate old responses.
  if (refreshPromise) {
    await refreshPromise;
    if (state.loading) return refreshGame();
    return;
  }
  const seq = refreshSequence,
    account = state.accountId;
  refreshPromise = (async () => {
    if (!GAME_ID || !USDC_ID) {
      publish({
        loading: false,
        error:
          "Testnet contracts are not configured. Connect a wallet to get your account address.",
      });
      return;
    }
    try {
      const [
        config,
        shop,
        listings,
        player,
        balance,
        usdc,
        registration,
        legacyStarter,
      ] = await Promise.all([
        view<ChainConfig>(GAME_ID, "get_config"),
        view<ShopItem[]>(GAME_ID, "get_shop"),
        view<ChainListing[]>(GAME_ID, "get_listings"),
        account
          ? view<ChainPlayer>(GAME_ID, "get_player", { account_id: account })
          : null,
        account
          ? rpc<{ amount: string }>("query", {
              request_type: "view_account",
              account_id: account,
              finality: "final",
            }).catch(() => ({ amount: "0" }))
          : null,
        account
          ? view<string>(USDC_ID, "ft_balance_of", { account_id: account })
          : null,
        account
          ? view<unknown>(USDC_ID, "storage_balance_of", {
              account_id: account,
            })
          : null,
        account && IS_MOCK_USDC
          ? view<boolean>(USDC_ID, "has_faucet_claimed", {
              account_id: account,
            }).catch(() => false)
          : false,
      ]);
      if (seq !== refreshSequence) return;
      const cards: ScanResult[] = (player?.cards ?? []).map((c) => ({
        id: c.token_id,
        barcode: c.barcode,
        cardId: c.card_id,
      }));
      publish({
        config,
        shop,
        listings,
        player: player
          ? {
              ...player,
              starter_claimed: !!player.starter_claimed || !!legacyStarter,
            }
          : player,
        near: balance?.amount ?? null,
        usdc,
        usdcRegistered: !!registration,
        cardsRaw: JSON.stringify(cards),
        loading: false,
        error: null,
      });
    } catch (e) {
      if (seq === refreshSequence)
        publish({ error: message(e), loading: false });
    }
  })();
  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to reach NEAR. Try again.";
}
const storageDeposit = units("0.01", 24);
export async function transact(
  call: Call,
  kind: TxKind,
  title: string,
  detail?: string,
): Promise<ChainTx> {
  if (!state.accountId || !sender)
    throw new Error("Connect your NEAR wallet in Settings first.");
  if (!GAME_ID || !USDC_ID)
    throw new Error("Contracts are not configured yet.");
  if (busy) throw new Error("Wait for your current transaction to finish.");
  const accountId = state.accountId;
  const send = sender;
  busy = true;
  let hash: string | undefined;
  publish({ proof: { phase: "authorizing", title, detail } });
  const intent = {
    accountId,
    kind,
    title,
    detail,
    timestamp: Date.now(),
    receiverId: call.receiverId,
  };
  try {
    // Wallet redirects can unload the page before returning the execution outcome.
    sessionStorage.setItem("scanmon:pending-tx", JSON.stringify(intent));
    const outcome = await send({
      ...call,
      gas: call.gas ?? "150000000000000",
      deposit: call.deposit ?? "1",
    });
    if (!outcome)
      throw new Error(
        "Finish signing in your wallet. A returning receipt will be checked automatically.",
      );
    hash = outcome.transaction.hash;
    record({ ...intent, hash, status: "pending" });
    publish({ proof: { phase: "confirming", title, detail, hash } });
    const final = await finalTransaction(hash, accountId);
    assertSucceeded(
      final,
      kind === "buy"
        ? ["trade", "listing_bought"]
        : kind === "faucet"
          ? ["payout"]
          : kind === "boss"
            ? ["boss_reward"]
            : undefined,
    );
    const tx: ChainTx = { ...intent, hash, status: "success" };
    record(tx);
    sessionStorage.removeItem("scanmon:pending-tx");
    if (state.accountId === accountId)
      publish({ proof: { phase: "success", title, detail, hash } });
    await refreshGame();
    return tx;
  } catch (e) {
    if (hash && !(e instanceof SettlementError)) {
      record({ ...intent, hash, status: "pending" });
      publish({
        proof: {
          phase: "confirming",
          title,
          detail,
          hash,
          error:
            "Receipt verification is temporarily unavailable. This transaction remains pending; check Explorer before retrying.",
        },
      });
    } else {
      if (hash)
        record({ ...intent, hash, status: "failed", detail: message(e) });
      publish({
        proof: { phase: "failed", title, detail, hash, error: message(e) },
      });
    }
    throw e;
  } finally {
    busy = false;
  }
}
export async function recoverRedirect() {
  const url = new URL(window.location.href);
  const hashes = url.searchParams.get("transactionHashes");
  const error = url.searchParams.get("errorCode");
  const intent = storedSession();
  if (!intent || state.accountId !== intent.accountId) return;
  if (error) {
    publish({
      proof: {
        phase: "failed",
        title: intent.title,
        error: "Wallet request was cancelled or rejected.",
      },
    });
    sessionStorage.removeItem("scanmon:pending-tx");
  }
  if (hashes) {
    for (const hash of hashes.split(",")) {
      publish({ proof: { phase: "confirming", title: intent.title, hash } });
      record({ ...intent, hash, status: "pending" });
      try {
        assertSucceeded(
          await finalTransaction(hash, intent.accountId),
          intent.kind === "buy"
            ? ["trade", "listing_bought"]
            : intent.kind === "faucet"
              ? ["payout"]
              : intent.kind === "boss"
                ? ["boss_reward"]
                : undefined,
        );
        record({ ...intent, hash, status: "success" });
        publish({
          proof: {
            phase: "success",
            title: intent.title,
            detail: intent.detail,
            hash,
          },
        });
      } catch (e) {
        record({ ...intent, hash, status: "failed" });
        publish({
          proof: {
            phase: "failed",
            title: intent.title,
            hash,
            error: message(e),
          },
        });
      }
    }
    sessionStorage.removeItem("scanmon:pending-tx");
    await refreshGame();
  }
  if (hashes || error) {
    url.searchParams.delete("transactionHashes");
    url.searchParams.delete("errorCode");
    url.searchParams.delete("errorMessage");
    window.history.replaceState({}, "", url);
  }
}
function storedSession(): Omit<ChainTx, "hash" | "status"> | null {
  try {
    return JSON.parse(sessionStorage.getItem("scanmon:pending-tx") ?? "null");
  } catch {
    return null;
  }
}
export async function reconcilePending() {
  for (const tx of state.history.filter((tx) => tx.status === "pending")) {
    try {
      assertSucceeded(
        await finalTransaction(tx.hash, tx.accountId),
        tx.kind === "buy"
          ? ["trade", "listing_bought"]
          : tx.kind === "faucet"
            ? ["payout"]
            : tx.kind === "boss"
              ? ["boss_reward"]
              : undefined,
      );
      record({ ...tx, status: "success" });
    } catch (error) {
      if (error instanceof SettlementError)
        record({
          ...tx,
          status: "failed",
        }); /* RPC outages keep unknown finality pending. */
    }
  }
}
async function registerUsdc() {
  if (state.usdcRegistered) return;
  await transact(
    {
      receiverId: USDC_ID,
      methodName: "storage_deposit",
      args: { account_id: state.accountId, registration_only: true },
      deposit: units("0.01", 24),
    },
    "storage",
    "USDC storage registered",
  );
}
export async function faucet() {
  if (state.player?.starter_claimed)
    throw new Error("Your 25 USDC starter grant is already claimed.");
  if (state.config && BigInt(state.config.tomo_budget) < BigInt(25000000))
    throw new Error("Tomo’s shared pool has less than 25 USDC available.");
  if (!IS_MOCK_USDC)
    throw new Error("Use Circle’s official testnet faucet for this token.");
  await registerUsdc();
  return transact(
    {
      receiverId: GAME_ID,
      methodName: "claim_starter",
      args: {},
      deposit: storageDeposit,
    },
    "faucet",
    "Test USDC received",
    "25 USDC from Tomo’s shared testnet pool",
  );
}
export async function mintCard(result: ScanResult) {
  if (!state.accountId)
    throw new Error("Connect your NEAR wallet in Settings first.");
  const discovery = await view<ChainCard | null>(GAME_ID, "get_discovery", {
    account_id: state.accountId,
    barcode: result.barcode,
  });
  if (discovery)
    throw new Error(
      discovery.owner_id === state.accountId
        ? "You already own this discovery. Open Collection to see it."
        : "You already minted this barcode this season. Its original card has been traded; each discovery can only be minted once.",
    );

  return transact(
    {
      receiverId: GAME_ID,
      methodName: "mint_scan",
      args: { barcode: result.barcode },
      deposit: storageDeposit,
    },
    "mint",
    "Card minted on NEAR",
    `Discovery ${result.barcode} · NEP-245`,
  );
}
export async function claimTask(taskId: string) {
  await registerUsdc();
  return transact(
    {
      receiverId: GAME_ID,
      methodName: "claim_task",
      args: { task_id: taskId },
      deposit: storageDeposit,
    },
    "quest",
    "Tomo reward claimed",
    `USDC + Shards from ${state.config?.tomo_account_id ?? "Tomo"}`,
  );
}
export async function claimLoot() {
  await registerUsdc();
  return transact(
    {
      receiverId: GAME_ID,
      methodName: "claim_loot",
      args: {},
      deposit: storageDeposit,
    },
    "loot",
    "Raid loot claimed",
    "+2 USDC · +10 Shards · one payout per day",
  );
}
export interface SignedKobanOffer {
  offerId: string;
  expiresAtSec: number;
  signature: number[];
}

export async function trade(
  direction: "buy" | "sell",
  cardId: string,
  amount: string,
  tokenId?: string,
  signedOffer?: SignedKobanOffer,
) {
  await registerUsdc();
  if (direction === "buy")
    return transact(
      {
        receiverId: USDC_ID,
        methodName: "ft_transfer_call",
        args: {
          receiver_id: GAME_ID,
          amount: units(amount),
          msg: JSON.stringify(
            signedOffer
              ? {
                  action: "buy",
                  card_id: cardId,
                  offer_id: signedOffer.offerId,
                  expires_at: signedOffer.expiresAtSec,
                  signature: signedOffer.signature,
                }
              : { action: "buy", card_id: cardId },
          ),
        },
        gas: "250000000000000",
      },
      "buy",
      "Koban trade receipt",
      `Bought ${cardId} · ${amount} USDC`,
    );
  return transact(
    {
      receiverId: GAME_ID,
      methodName: "sell_to_koban",
      args: signedOffer
        ? {
            token_id: tokenId,
            expected_price: units(amount),
            offer_id: signedOffer.offerId,
            expires_at: signedOffer.expiresAtSec,
            signature: signedOffer.signature,
          }
        : { token_id: tokenId, expected_price: units(amount) },
    },
    "sell",
    "Koban trade receipt",
    `Sold ${cardId} · ${amount} USDC`,
  );
}
export async function saveTeam(ids: string[]) {
  const cards = state.player?.cards ?? [];
  if (
    ids.length > 3 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !cards.some((c) => c.token_id === id))
  )
    throw new Error("Choose up to three owned cards.");
  if (!state.accountId) throw new Error("Connect a wallet first.");
  localStorage.setItem(teamKey(state.accountId), JSON.stringify(ids));
  publish({ team: ids });
}
function assertRaidTeam(ids: string[]) {
  if (!state.accountId)
    throw new Error("Connect your NEAR wallet in Settings first.");
  if (state.loading || !state.player)
    throw new Error("Your cards are still loading. Try again.");
  if (
    ids.length !== 3 ||
    new Set(ids).size !== 3 ||
    ids.some(
      (id) =>
        !state.player!.cards.some((card) => card.token_id === id) ||
        state.player!.locked_ids.includes(id),
    )
  )
    throw new Error("Choose three available owned cards.");
}
export async function startRaid(ids: string[]) {
  assertRaidTeam(ids);
  const team = ids.map((instanceId) => ({
    instanceId,
    cardId: state.player!.cards.find((card) => card.token_id === instanceId)!
      .card_id,
  }));
  persistRaid(newRaid(team, `local-raid:${crypto.randomUUID()}`));
}
export async function attack(input: {
  battleId: string;
  round: number;
  instanceId: string;
  skillId: string;
}) {
  const session = state.raidSession;
  if (
    !session ||
    session.battle.id !== input.battleId ||
    session.battle.round !== input.round
  )
    throw new Error("This round has changed. Choose your action again.");
  assertRaidTeam(session.team.map((card) => card.instanceId));
  persistRaid(
    raidTurn(session, {
      instance_id: input.instanceId,
      skill_id: input.skillId,
    }),
  );
}
export async function claimBossReward() {
  const session = state.raidSession;
  if (!session || session.battle.phase !== "won")
    throw new Error("Defeat the boss before claiming its card.");
  assertRaidTeam(session.team.map((card) => card.instanceId));
  const tx = await transact(
    {
      receiverId: GAME_ID,
      methodName: "claim_boss_reward",
      args: {
        team_ids: session.team.map((card) => card.instanceId),
        actions: session.actions,
      },
      deposit: storageDeposit,
      gas: "250000000000000",
    },
    "boss",
    "Boss card claimed",
    "First-clear collectible · added to your vault",
  );
  // A periodic read may have started before finality; get a fresh vault snapshot.
  await refreshGame();
  return tx;
}
export async function listCard(tokenId: string, price: string) {
  await transact(
    {
      receiverId: GAME_ID,
      methodName: "list_card",
      args: { token_id: tokenId, price: units(price) },
      deposit: storageDeposit,
    },
    "list",
    "Card listed on NEAR",
    `${price} USDC · held in escrow`,
  );
}
export async function cancelListing(id: string) {
  await transact(
    {
      receiverId: GAME_ID,
      methodName: "cancel_listing",
      args: { listing_id: id },
    },
    "cancel",
    "Listing cancelled",
  );
}
export async function buyListing(id: string, price: string) {
  await registerUsdc();
  await transact(
    {
      receiverId: USDC_ID,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: GAME_ID,
        amount: price,
        msg: JSON.stringify({ action: "listing", listing_id: id }),
      },
      gas: "250000000000000",
    },
    "buy",
    "Player trade receipt",
  );
}
export async function withdrawUsdc() {
  await registerUsdc();
  await transact(
    { receiverId: GAME_ID, methodName: "withdraw_usdc", args: {} },
    "withdraw",
    "USDC withdrawn to wallet",
  );
}
export function ownedCards(): ChainCard[] {
  return state.player?.cards ?? [];
}
export function raid(): BattleState | null {
  return state.raidSession?.battle ?? null;
}
