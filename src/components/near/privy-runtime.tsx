"use client";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useSignRawHash,
} from "@privy-io/react-auth/extended-chains";
import { useEffect, useRef, useState } from "react";
import { Account } from "@near-js/accounts";
import { PublicKey } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import {
  Signature,
  SignedTransaction,
  encodeTransaction,
  actionCreators,
} from "@near-js/transactions";
import type { Signer } from "@near-js/signers";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import { RPC_URL } from "@/lib/near/config";
import {
  gameUi,
  setWallet,
  refreshGame,
  recoverRedirect,
} from "@/lib/near/game-store";
import { registerGoogleLogin } from "@/lib/near/wallet-selector";
import type { Outcome } from "@/lib/near/rpc";
import { createGoogleWalletActivation } from "@/lib/near/google-wallet";
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (str: string) =>
  Uint8Array.from(str.replace(/^0x/, "").match(/../g) ?? [], (h) =>
    parseInt(h, 16),
  );
function Bridge() {
  const { ready, authenticated, user, login, logout, getAccessToken } =
    usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const [modeVersion, setModeVersion] = useState(0);
  const creating = useRef(false);
  const connected = useRef<string | null>(null);
  // Keep signer closures current without replacing the active wallet every render.
  const actions = useRef({
    login,
    logout,
    getAccessToken,
    createWallet,
    signRawHash,
    authenticated,
  });
  useEffect(() => {
    actions.current = {
      login,
      logout,
      getAccessToken,
      createWallet,
      signRawHash,
      authenticated,
    };
  });
  useEffect(() => {
    if (!ready) return;
    registerGoogleLogin(() => {
      if (actions.current.authenticated) {
        connected.current = null;
        setModeVersion((version) => version + 1);
      } else actions.current.login({ loginMethods: ["google"] });
    });
    return () => registerGoogleLogin(null);
  }, [ready]);
  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !user ||
      localStorage.getItem("scanmon:wallet-mode") !== "google"
    )
      return;
    const nearWallet = user.linkedAccounts.find(
      (a) => a.type === "wallet" && a.chainType === "near",
    );
    if (!nearWallet || nearWallet.type !== "wallet") {
      if (creating.current) return;
      creating.current = true;
      gameUi.connecting(true);
      actions.current
        .createWallet({ chainType: "near" })
        .catch((e) => {
          gameUi.error(e.message);
          gameUi.connecting(false);
        })
        .finally(() => {
          creating.current = false;
        });
      return;
    }
    const address = nearWallet.address.replace(/^0x/, "");
    if (!/^[a-f0-9]{64}$/i.test(address)) {
      gameUi.error("Privy returned an unsupported NEAR account address.");
      return;
    }
    if (connected.current === address) return;
    connected.current = address;
    const publicKey = PublicKey.fromString(
      `ed25519:${base58.encode(unhex(address))}`,
    );
    const signer: Signer = {
      getPublicKey: async () => publicKey,
      signTransaction: async (transaction) => {
        const digest = sha256(encodeTransaction(transaction));
        const { signature } = await actions.current.signRawHash({
          address: nearWallet.address,
          chainType: "near",
          hash: `0x${hex(digest)}`,
        });
        return [
          digest,
          new SignedTransaction({
            transaction,
            signature: new Signature({ keyType: 0, data: unhex(signature) }),
          }),
        ];
      },
      signNep413Message: async () => {
        throw new Error("NEP-413 is not needed for gameplay.");
      },
      signDelegateAction: async () => {
        throw new Error("Delegate signing is not enabled.");
      },
    };
    const account = new Account(
      address,
      new JsonRpcProvider({ url: RPC_URL }),
      signer,
    );
    const activate = createGoogleWalletActivation({
      checkAccessKey: () =>
        account.provider.viewAccessKey(address, publicKey, {
          finality: "final",
        }),
      sponsor: async () => {
        const token = await actions.current.getAccessToken();
        if (!token)
          throw new Error("Session expired. Sign in with Google again.");
        const response = await fetch("/api/near/sponsor", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountId: address }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ??
              "Wallet activation unavailable. Retry or fund your account with test NEAR.",
          );
      },
    });
    setWallet(
      address,
      "Google · Privy NEAR",
      async (call) => {
        await activate();
        return (await account.signAndSendTransaction({
          receiverId: call.receiverId,
          actions: [
            actionCreators.functionCall(
              call.methodName,
              call.args,
              BigInt(call.gas!),
              BigInt(call.deposit!),
            ),
          ],
          waitUntil: "FINAL",
          throwOnFailure: false,
        })) as unknown as Outcome;
      },
      async () => {
        connected.current = null;
        localStorage.removeItem("scanmon:wallet-mode");
        await actions.current.logout();
      },
    );
    // Server verifies the authenticated user's linked NEAR wallet before sponsoring.
    void (async () => {
      try {
        await activate();
      } catch (error) {
        gameUi.error(
          error instanceof Error
            ? error.message
            : "Gas sponsorship unavailable. You can fund your account with test NEAR.",
        );
      }
      await refreshGame();
      await recoverRedirect();
    })();
  }, [ready, authenticated, user, modeVersion]);
  return null;
}
export default function PrivyRuntime({ appId }: { appId: string }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google"],
        appearance: {
          theme: "light",
          accentColor: "#192546",
          logo: "/assets/logo-scanmon.png",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}
