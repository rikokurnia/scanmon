import { isKnownCardId, type CardId } from "../collection/card-catalog";
import type { BattleState } from "./battle-interface";

/** Mirrors the contract's replay rules. Printed artwork stats are unrelated. */
export interface RaidAction {
  instance_id: string;
  skill_id: string;
}
export interface RaidCard {
  instanceId: string;
  cardId: CardId;
}
export interface RaidSession {
  version: 1;
  team: RaidCard[];
  actions: RaidAction[];
  battle: BattleState;
}
export function newRaid(team: RaidCard[], id: string): RaidSession {
  if (
    team.length !== 3 ||
    team.some(
      (card) =>
        typeof card.instanceId !== "string" || !isKnownCardId(card.cardId),
    ) ||
    new Set(team.map((c) => c.instanceId)).size !== 3
  )
    throw new Error("Choose three different owned cards.");
  return {
    version: 1,
    team,
    actions: [],
    battle: {
      id,
      round: 1,
      phase: "choosing",
      bossHp: 360,
      bossMaxHp: 360,
      status: "Choose a character, then Attack. Switch to pause attacks.",
      team: team.map((card) => ({
        instanceId: card.instanceId,
        hp: 120,
        maxHp: 120,
        skill: {
          id: "strike",
          name: card.cardId === "pikachu" ? "Thunder Strike" : "Rift Strike",
        },
      })),
    },
  };
}
export function raidTurn(
  session: RaidSession,
  action: RaidAction,
): RaidSession {
  const before = session.battle;
  if (before.phase !== "choosing" || session.actions.length >= 32)
    throw new Error("This battle has ended.");
  const index = before.team.findIndex(
    (c) => c.instanceId === action.instance_id && c.hp > 0,
  );
  if (index < 0 || action.skill_id !== "strike")
    throw new Error("Choose a living character and its available skill.");
  const card = session.team.find((c) => c.instanceId === action.instance_id)!;
  const damage = card.cardId === "pikachu" ? 85 : 65;
  const bossHp = Math.max(0, before.bossHp - damage);
  const hit = bossHp === 0 ? 0 : before.round % 3 === 0 ? 50 : 25;
  const team = before.team.map((c, i) =>
    i === index ? { ...c, hp: Math.max(0, c.hp - hit) } : c,
  );
  const phase =
    bossHp === 0 ? "won" : team.every((c) => c.hp === 0) ? "lost" : "choosing";
  const round = before.round + 1;
  return {
    ...session,
    actions: [...session.actions, action],
    battle: {
      ...before,
      round,
      phase,
      bossHp,
      team,
      status:
        phase === "won"
          ? "Boss defeated! Reveal your first-clear reward."
          : phase === "lost"
            ? "Team defeated. Try a different character order."
            : `You dealt ${damage} damage. Boss dealt ${hit} damage.`,
      heavyAttackWarning:
        phase === "choosing" && round % 3 === 0
          ? "Heavy rainbow strike next! Switch to a healthy character."
          : undefined,
      effect: {
        id: `${before.id}:${before.round}`,
        source: card.cardId,
        hit: true,
      },
    },
  };
}
/** Rebuild from actions; never trust cached HP, phase, or a browser victory flag. */
export function restoreRaid(raw: string | null): RaidSession | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as RaidSession;
    if (
      saved.version !== 1 ||
      typeof saved.battle.id !== "string" ||
      !Array.isArray(saved.team) ||
      !Array.isArray(saved.actions) ||
      saved.actions.length > 32
    )
      return null;
    return saved.actions.reduce(raidTurn, newRaid(saved.team, saved.battle.id));
  } catch {
    return null;
  }
}
export function attackArt(cardId: CardId | "boss") {
  return `/assets/battle/${cardId === "boss" || cardId === "almarts27-hamster-boss" ? "rainbow-attack-almart27" : `attack-${cardId}`}.png`;
}
