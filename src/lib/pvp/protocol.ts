import type { CardId } from "@/app/collection/card-catalog";
import type { PvpAction, PvpState, PvpHit } from "./engine";
export interface PvpPlayer {
  account_id: string;
  username: string;
  stake_id: string;
  team_ids: string[];
  card_ids: CardId[];
  session_key: string;
}
export interface PvpRoom {
  id: string;
  host: PvpPlayer;
  guest: PvpPlayer | null;
  phase: "waiting" | "active" | "settled" | "cancelled";
  winner: string | null;
  expires_at: string;
}
export interface Certificate {
  outcome: string;
  expires_at: string;
  signature: number[];
}
export interface RoomView {
  room: PvpRoom;
  battle: PvpState | null;
  submitted: boolean[];
  cancelled: boolean;
  certificate: Certificate | null;
  lastSeen: number[];
  serverNow: number;
  battleStartedAt: number | null;
  deadlineAt: number | null;
  hits: PvpHit[];
}
export interface Envelope {
  roomId: string;
  accountId: string;
  at: number;
  action: PvpAction | null;
  signature: string;
}
export function sessionMessage(
  contract: string,
  input: Omit<Envelope, "signature">,
) {
  return JSON.stringify({
    domain: "scanmon-pvp:session:v1",
    contract,
    roomId: input.roomId,
    accountId: input.accountId,
    at: input.at,
    action: input.action
      ? {
          round: input.action.round,
          actor: input.action.actor,
          target: input.action.target,
          skill: input.action.skill,
        }
      : null,
  });
}
