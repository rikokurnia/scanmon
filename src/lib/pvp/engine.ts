import type { CardId } from "@/app/collection/card-catalog";

export interface PvpCard {
  tokenId: string;
  cardId: CardId;
}
export interface PvpFighter extends PvpCard {
  hp: number;
  maxHp: number;
}
export interface PvpAction {
  round: number;
  actor: string;
  target: string;
  skill: "strike";
}
export interface PvpState {
  round: number;
  phase: "choosing" | "won" | "draw";
  winner: 0 | 1 | null;
  teams: [PvpFighter[], PvpFighter[]];
}
export interface PvpRoundResult {
  state: PvpState;
  hits: [
    { source: CardId; target: string; damage: number },
    { source: CardId; target: string; damage: number },
  ];
}
export const PVP_MAX_ROUNDS = 32;
export function createPvp(teams: [PvpCard[], PvpCard[]]): PvpState {
  const ids = teams.flat().map((c) => c.tokenId);
  if (teams.some((team) => team.length !== 3) || new Set(ids).size !== 6)
    throw new Error("Each player needs three different owned cards.");
  return {
    round: 1,
    phase: "choosing",
    winner: null,
    teams: teams.map((team) =>
      team.map((card) => ({ ...card, hp: 120, maxHp: 120 })),
    ) as PvpState["teams"],
  };
}
/** Both players act from the SAME pre-round snapshot: no first-submission advantage. */
export function resolvePvpRound(
  before: PvpState,
  actions: [PvpAction, PvpAction],
): PvpRoundResult {
  if (before.phase !== "choosing" || before.round > PVP_MAX_ROUNDS)
    throw new Error("This match has ended.");
  const hits = actions.map((action, side) => {
    if (action.round !== before.round || action.skill !== "strike")
      throw new Error("This round has changed.");
    const actor = before.teams[side].find(
      (card) => card.tokenId === action.actor && card.hp > 0,
    );
    const target = before.teams[1 - side].find(
      (card) => card.tokenId === action.target && card.hp > 0,
    );
    if (!actor || !target)
      throw new Error("Choose a living character and opponent.");
    return {
      source: actor.cardId,
      target: target.tokenId,
      damage: actor.cardId === "pikachu" ? 45 : 35,
    };
  }) as PvpRoundResult["hits"];
  const teams = before.teams.map((team, side) =>
    team.map((card) => ({
      ...card,
      hp: Math.max(
        0,
        card.hp -
          (hits[1 - side].target === card.tokenId ? hits[1 - side].damage : 0),
      ),
    })),
  ) as PvpState["teams"];
  const dead = teams.map((team) => team.every((card) => card.hp === 0));
  const draw =
    dead.every(Boolean) ||
    (!dead.some(Boolean) && before.round === PVP_MAX_ROUNDS);
  const winner = draw ? null : dead[0] ? 1 : dead[1] ? 0 : null;
  return {
    state: {
      round: before.round + 1,
      teams,
      winner,
      phase: draw ? "draw" : winner !== null ? "won" : "choosing",
    },
    hits,
  };
}
/** The same canonical bytes are signed by each room-scoped key and checked at settlement. */
export function actionMessage(
  contract: string,
  roomId: string,
  action: PvpAction,
): string {
  for (const value of [contract, roomId, action.actor, action.target])
    if (!value || /[|\n\r]/.test(value))
      throw new Error("Invalid action identifier.");
  if (
    !Number.isSafeInteger(action.round) ||
    action.round < 1 ||
    action.round > PVP_MAX_ROUNDS ||
    action.skill !== "strike"
  )
    throw new Error("Invalid round action.");
  return `scanmon-pvp:v1|${contract}|${roomId}|${action.round}|${action.actor}|${action.target}|strike`;
}
export function normalizeUsername(input: string): string {
  const name = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(name))
    throw new Error(
      "Use 3–20 letters, numbers or underscores, starting with a letter.",
    );
  return name;
}
