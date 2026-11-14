"use client";
import { GAME_ID } from "@/lib/near/config";
import { sessionMessage, type Envelope, type RoomView } from "./protocol";
import type { PvpAction } from "./engine";
const keyName = (account: string) =>
  `scanmon:pvp-session:${GAME_ID}:${account}`;
interface Session {
  publicKey: string;
  privateKey: string;
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (h) => parseInt(h, 16));
export async function pvpSession(account: string): Promise<Session> {
  const saved = localStorage.getItem(keyName(account));
  if (saved) return JSON.parse(saved);
  const key = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const session = {
    publicKey: hex(
      new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey)),
    ),
    privateKey: hex(
      new Uint8Array(await crypto.subtle.exportKey("pkcs8", key.privateKey)),
    ),
  };
  localStorage.setItem(keyName(account), JSON.stringify(session));
  return session;
}
export async function pollPvp(
  roomId: string,
  accountId: string,
  action: PvpAction | null = null,
): Promise<RoomView> {
  const session = await pvpSession(accountId);
  const input: Omit<Envelope, "signature"> = {
    roomId,
    accountId,
    at: Date.now(),
    action,
  };
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bytes(session.privateKey),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      key,
      new TextEncoder().encode(sessionMessage(GAME_ID, input)),
    ),
  );
  const response = await fetch("/api/pvp/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      signature: btoa(String.fromCharCode(...signature)),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Match unavailable.");
  return result;
}
