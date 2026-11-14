import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { createPublicKey, verify, randomBytes } from "node:crypto";
import { KeyPair } from "near-api-js";
import { GAME_ID } from "@/lib/near/config";
import { view } from "@/lib/near/rpc";
import {
  createPvp,
  advancePvp,
  PVP_DURATION_MS,
  type PvpHit,
  type PvpAction,
  type PvpState,
} from "./engine";
import {
  sessionMessage,
  type Envelope,
  type PvpRoom,
  type RoomView,
} from "./protocol";
let pool: Pool | undefined;
export function pvpPool() {
  if (!process.env.PVP_DATABASE_URL)
    throw new Error("PvP database is not configured.");
  if (!pool) {
    const databaseUrl = new URL(process.env.PVP_DATABASE_URL);
    databaseUrl.searchParams.set("sslmode", "verify-full");
    pool = new Pool({
      connectionString: databaseUrl.toString(),
      max: 4,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
    });
    attachDatabasePool(pool);
  }
  return pool;
}
interface Data {
  battle: PvpState | null;
  pending: [PvpAction | null, PvpAction | null];
  lastSeen: [number, number];
  cancelled: boolean;
  started: boolean;
  ready?: [boolean, boolean];
  battleStartedAt?: number;
  gameSeed?: string;
  hits?: PvpHit[];
}
export async function handleRoom(input: Envelope): Promise<RoomView> {
  let now = Date.now();
  if (
    !input ||
    typeof input.roomId !== "string" ||
    input.roomId.length > 80 ||
    typeof input.accountId !== "string" ||
    !Number.isSafeInteger(input.at) ||
    Math.abs(input.at - now) > 30000 ||
    typeof input.signature !== "string" ||
    input.signature.length > 100
  )
    throw new Error("Session expired. Refresh the match.");
  const room = await view<PvpRoom | null>(GAME_ID, "pvp_room", {
    room_id: input.roomId,
  });
  if (!room) throw new Error("Match not found.");
  const players = [room.host, room.guest];
  const side = players.findIndex((p) => p?.account_id === input.accountId);
  if (side < 0) throw new Error("Not your match.");
  const publicKey = Buffer.from(players[side]!.session_key, "hex");
  if (publicKey.length !== 32) throw new Error("Invalid player session.");
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      publicKey,
    ]),
    type: "spki",
    format: "der",
  });
  if (
    !verify(
      null,
      Buffer.from(sessionMessage(GAME_ID, input)),
      key,
      Buffer.from(input.signature, "base64"),
    )
  )
    throw new Error("Invalid player signature.");
  const client = await pvpPool().connect();
  let result: RoomView;
  try {
    await client.query("BEGIN");
    const initial: Data = {
      battle: null,
      pending: [null, null],
      lastSeen: [now, now],
      cancelled: false,
      started: false,
    };
    await client.query(
      "INSERT INTO scanmon_pvp_rooms (id,data) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [room.id, JSON.stringify(initial)],
    );
    const row = await client.query<{ data: Data }>(
      "SELECT data FROM scanmon_pvp_rooms WHERE id=$1 FOR UPDATE",
      [room.id],
    );
    const data = row.rows[0].data;
    now = Date.now();
    data.ready ??= [false, false];
    if (room.phase === "active" && !data.started) {
      data.gameSeed = randomBytes(16).toString("hex");
      data.battle = createPvp(
        [room.host, room.guest!].map((p) =>
          p.team_ids.map((tokenId, i) => ({ tokenId, cardId: p.card_ids[i] })),
        ) as Parameters<typeof createPvp>[0],
        data.gameSeed,
      );
      data.lastSeen = [now, now];
      data.started = true;
    }
    // Never reinterpret already-escrowed legacy choosing rounds with new combat rules.
    if (
      data.battle &&
      data.battle.version !== 2 &&
      data.battle.phase === "choosing"
    )
      data.cancelled = true;
    if (data.battleStartedAt && data.battle?.version === 2 && !data.cancelled) {
      const next = advancePvp(data.battle, now - data.battleStartedAt);
      data.battle = next.state;
      if (next.hits.length) data.hits = next.hits;
    }
    if (
      data.started &&
      data.battle?.phase === "choosing" &&
      data.lastSeen.some((time) => now - time > 90000)
    )
      data.cancelled = true;
    if (room.phase === "cancelled" || Number(room.expires_at) * 1000 <= now)
      data.cancelled = true;
    data.lastSeen[side] = now;
    if (input.action) {
      if (
        room.phase !== "active" ||
        !data.battle ||
        data.cancelled ||
        data.battle.phase !== "choosing"
      )
        throw new Error("Match is no longer accepting actions.");
      if (
        input.action.skill !== "auto" ||
        input.action.actor !== "" ||
        input.action.target !== ""
      )
        throw new Error("Choose Attack to start the full team.");
      data.ready[side] = true;
      if (data.ready.every(Boolean) && !data.battleStartedAt)
        data.battleStartedAt = now;
    }
    await client.query(
      "UPDATE scanmon_pvp_rooms SET data=$2,updated_at=now() WHERE id=$1",
      [room.id, JSON.stringify(data)],
    );
    await client.query("COMMIT");
    let certificate: RoomView["certificate"] = null;
    if (
      room.phase === "active" &&
      (data.cancelled ||
        data.battle?.phase === "won" ||
        data.battle?.phase === "draw")
    ) {
      const outcome =
        data.cancelled || data.battle?.winner === null
          ? "refund"
          : players[data.battle!.winner!]!.account_id;
      const expires_at = String(
        Math.min(Math.floor(now / 1000) + 300, Number(room.expires_at)),
      );
      const secret = process.env.NEAR_SPONSOR_PRIVATE_KEY;
      if (!secret) throw new Error("PvP result signing is not configured.");
      const signer = KeyPair.fromString(secret as `ed25519:${string}`);
      const message = `scanmon-pvp:v1|${GAME_ID}|${room.id}|${outcome}|${expires_at}`;
      certificate = {
        outcome,
        expires_at,
        signature: Array.from(signer.sign(Buffer.from(message)).signature),
      };
    }
    result = {
      room,
      battle: data.battle,
      submitted: data.ready,
      serverNow: now,
      battleStartedAt: data.battleStartedAt ?? null,
      deadlineAt: data.battleStartedAt
        ? data.battleStartedAt + PVP_DURATION_MS
        : null,
      hits: data.hits ?? [],
      cancelled: data.cancelled,
      certificate,
      lastSeen: data.lastSeen,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return result;
}
