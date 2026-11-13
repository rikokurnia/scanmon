"use client";
import { actionCreators } from "@near-js/transactions";
import type { WalletSelector } from "@near-wallet-selector/core";
import { GAME_ID, RPC_URL } from "./config";
import { gameUi, recoverRedirect, setWallet } from "./game-store";
import type { Outcome } from "./rpc";
let selectorPromise: Promise<WalletSelector> | null = null;
export async function selector() {
  if (!selectorPromise)
    selectorPromise = (async () => {
      const [
        { setupWalletSelector },
        { setupHereWallet },
        { setupMeteorWallet },
        { setupMyNearWallet },
      ] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/here-wallet"),
        import("@near-wallet-selector/meteor-wallet"),
        import("@near-wallet-selector/my-near-wallet"),
      ]);
      const instance = await setupWalletSelector({
        network: {
          networkId: "testnet",
          nodeUrl: RPC_URL,
          helperUrl: "https://helper.testnet.near.org",
          explorerUrl: "https://testnet.nearblocks.io",
          indexerUrl: "https://api-testnet.nearblocks.io",
        },
        modules: [setupHereWallet(), setupMeteorWallet(), setupMyNearWallet()],
      });
      const sync = async () => {
        const account = instance.store
          .getState()
          .accounts.find((a) => a.active);
        if (!account) return;
        const wallet = await instance.wallet();
        if (localStorage.getItem("scanmon:wallet-mode") === "google") return;
        setWallet(
          account.accountId,
          wallet.metadata.name,
          async (call) =>
            (await wallet.signAndSendTransaction({
              receiverId: call.receiverId,
              actions: [
                actionCreators.functionCall(
                  call.methodName,
                  call.args,
                  BigInt(call.gas!),
                  BigInt(call.deposit!),
                ),
              ],
            })) as Outcome | undefined,
          async () => {
            await wallet.signOut();
            localStorage.removeItem("scanmon:wallet-mode");
          },
        );
        await recoverRedirect();
      };
      instance.store.observable.subscribe(() => {
        void sync().catch((e) => gameUi.error(e.message));
      });
      await sync();
      return instance;
    })().catch((e) => {
      selectorPromise = null;
      throw e;
    });
  return selectorPromise;
}
export async function connectNearWallet() {
  gameUi.connecting(true);
  try {
    localStorage.setItem("scanmon:wallet-mode", "selector");
    const instance = await selector();
    const { setupModal } = await import("@near-wallet-selector/modal-ui");
    const modal = setupModal(instance, {
      contractId: GAME_ID || "testnet",
      methodNames: [
        "mint_scan",
        "claim_task",
        "start_raid",
        "attack",
        "claim_loot",
        "sell_to_koban",
        "withdraw_usdc",
        "list_card",
        "cancel_listing",
      ],
      description: "Connect your NEAR testnet wallet to scanMon",
    });
    modal.show();
  } catch (e) {
    gameUi.error(e instanceof Error ? e.message : "Wallet connection failed.");
  } finally {
    gameUi.connecting(false);
  }
}
let googleLogin: (() => void) | null = null;
export function registerGoogleLogin(fn: (() => void) | null) {
  googleLogin = fn;
  gameUi.googleReady(!!fn);
}
export function connectGoogle() {
  if (googleLogin) {
    localStorage.setItem("scanmon:wallet-mode", "google");
    googleLogin();
  } else
    gameUi.error(
      "Google login is loading or Privy is not configured. Try again in a moment.",
    );
}
