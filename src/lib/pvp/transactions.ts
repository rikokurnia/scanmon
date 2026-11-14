"use client";
import { transact, refreshGame } from "@/lib/near/game-store";
import { GAME_ID, units } from "@/lib/near/config";
import { pvpSession } from "./client";
import { view } from "@/lib/near/rpc";
import type { PvpRoom } from "./protocol";
import { normalizeUsername } from "./engine";
import type { Certificate } from "./protocol";
export async function enterPvp(
  account: string,
  username: string,
  team: string[],
  stake: string,
  roomId?: string,
) {
  const session = await pvpSession(account);
  await transact(
    {
      receiverId: GAME_ID,
      methodName: roomId ? "join_pvp" : "create_pvp",
      args: {
        ...(roomId ? { room_id: roomId } : {}),
        username: normalizeUsername(username),
        team_ids: team,
        stake_id: stake,
        session_key: session.publicKey,
      },
      deposit: units("0.01", 24),
    },
    "pvp",
    "card locked in PvP escrow",
    "Your stake is protected until the match result.",
  );
  await refreshGame();
}
export async function settlePvp(roomId: string, certificate: Certificate) {
  const room = await view<PvpRoom>(GAME_ID, "pvp_room", { room_id: roomId });
  if (Number(room.expires_at) * 1000 <= Date.now()) {
    await cancelPvp(roomId, true);
    return;
  }
  await transact(
    {
      receiverId: GAME_ID,
      methodName: "claim_pvp",
      args: { room_id: roomId, ...certificate },
    },
    "pvp",
    certificate.outcome === "refund"
      ? "PvP stakes returned"
      : "PvP prize claimed",
  );
  await refreshGame();
}
export async function cancelPvp(roomId: string, expired = false) {
  await transact(
    {
      receiverId: GAME_ID,
      methodName: expired ? "expire_pvp" : "cancel_pvp",
      args: { room_id: roomId },
    },
    "pvp",
    "PvP stakes returned",
  );
  await refreshGame();
}
