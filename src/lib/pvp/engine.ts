import { isKnownCardId, type CardId } from "@/app/collection/card-catalog";
export const PVP_STATS: Record<CardId, { hp: number; atk: number }> = {
  doge: { hp: 80, atk: 90 },
  pepe: { hp: 90, atk: 60 },
  pikachu: { hp: 70, atk: 95 },
  veemon: { hp: 85, atk: 80 },
  "nyan-cat": { hp: 65, atk: 60 },
  piyomon: { hp: 60, atk: 35 },
  gengar: { hp: 70, atk: 50 },
  "chill-guy": { hp: 55, atk: 70 },
  "almarts27-hamster-boss": { hp: 100, atk: 98 },
};
export const PVP_DURATION_MS = 90000;
// PvP travels at 70% of boss speed, with one shot per living fighter.
export const PVP_TICK_MS = Math.round(1250 / 0.7);
export const PVP_MAX_ROUNDS = Math.floor(PVP_DURATION_MS / PVP_TICK_MS);
export interface PvpCard {
  tokenId: string;
  cardId: CardId;
}
export interface PvpFighter extends PvpCard {
  hp: number;
  maxHp: number;
  atk: number;
}
export interface PvpAction {
  round: number;
  actor: string;
  target: string;
  skill: "strike" | "auto";
}
export interface PvpState {
  version: 2;
  seed: string;
  round: number;
  phase: "choosing" | "won" | "draw";
  winner: 0 | 1 | null;
  teams: [PvpFighter[], PvpFighter[]];
}
export interface PvpHit {
  source: CardId;
  actor: string;
  target: string;
  side: 0 | 1;
  damage: number;
}
export interface PvpRoundResult {
  state: PvpState;
  hits: PvpHit[];
}
export function createPvp(
  teams: [PvpCard[], PvpCard[]],
  seed = "pvp-test",
): PvpState {
  const ids = teams.flat().map((c) => c.tokenId);
  if (
    teams.some((team) => team.length !== 3) ||
    new Set(ids).size !== 6 ||
    teams.flat().some((c) => !isKnownCardId(c.cardId))
  )
    throw new Error("Each player needs three different owned cards.");
  return {
    version: 2,
    seed,
    round: 1,
    phase: "choosing",
    winner: null,
    teams: teams.map((team) =>
      team.map((c) => ({
        ...c,
        hp: PVP_STATS[c.cardId].hp,
        maxHp: PVP_STATS[c.cardId].hp,
        atk: PVP_STATS[c.cardId].atk / 10,
      })),
    ) as PvpState["teams"],
  };
}
function hash(text: string) {
  return [...text].reduce(
    (n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
}
/** All six actions use the same pre-tick snapshot; no host/first-request advantage. */
export function resolveAutoRound(before: PvpState): PvpRoundResult {
  if (before.phase !== "choosing") return { state: before, hits: [] };
  const hits: PvpHit[] = [];
  for (const side of [0, 1] as const) {
    const targets = before.teams[1 - side].filter((c) => c.hp > 0);
    if (!targets.length) continue;
    for (const actor of before.teams[side].filter((c) => c.hp > 0)) {
      const target =
        targets[
          hash(
            before.seed + "|" + before.round + "|" + side + "|" + actor.tokenId,
          ) % targets.length
        ];
      hits.push({
        source: actor.cardId,
        actor: actor.tokenId,
        target: target.tokenId,
        side,
        damage: actor.atk,
      });
    }
  }
  const teams = before.teams.map((team) =>
    team.map((card) => ({
      ...card,
      hp: Math.max(
        0,
        Math.round(
          (card.hp -
            hits
              .filter((h) => h.target === card.tokenId)
              .reduce((n, h) => n + h.damage, 0)) *
            10,
        ) / 10,
      ),
    })),
  ) as PvpState["teams"];
  const dead = teams.map((team) => team.every((c) => c.hp === 0));
  const winner = dead[0] && !dead[1] ? 1 : dead[1] && !dead[0] ? 0 : null;
  return {
    state: {
      ...before,
      teams,
      round: before.round + 1,
      winner,
      phase: dead.every(Boolean)
        ? "draw"
        : winner !== null
          ? "won"
          : "choosing",
    },
    hits,
  };
}
/** Server clock catch-up makes polling speed irrelevant and stops combat at the deadline. */
export function advancePvp(
  before: PvpState,
  elapsedMs: number,
): PvpRoundResult {
  let state = before;
  let hits: PvpHit[] = [];
  const due = Math.floor(
    Math.min(PVP_DURATION_MS, Math.max(0, elapsedMs)) / PVP_TICK_MS,
  );
  while (state.phase === "choosing" && state.round - 1 < due) {
    const next = resolveAutoRound(state);
    state = next.state;
    hits = next.hits;
  }
  if (elapsedMs >= PVP_DURATION_MS && state.phase === "choosing")
    state = { ...state, phase: "draw", winner: null };
  return { state, hits };
}
export function actionMessage(
  contract: string,
  roomId: string,
  action: PvpAction,
) {
  return JSON.stringify({ contract, roomId, ...action });
}
export function normalizeUsername(input: string) {
  const name = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(name))
    throw new Error(
      "Use 3–20 letters, numbers or underscores, starting with a letter.",
    );
  return name;
}
