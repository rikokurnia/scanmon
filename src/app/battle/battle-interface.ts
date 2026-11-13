import type { CardId } from "../collection/card-catalog";

/** Ownership must be authoritative; catalog entries never grant playable cards. */
export interface BattleOwnedCard {
  instanceId: string;
  cardId: CardId;
  raidEligible: boolean;
  lockedByListing?: boolean;
  ineligibleReason?: string;
}
export interface Combatant {
  instanceId: string;
  hp: number;
  maxHp: number;
  skill: { id: string; name: string };
}
export interface BattleState {
  id: string;
  round: number;
  phase: "choosing" | "resolving" | "won" | "lost";
  bossHp: number;
  bossMaxHp: number;
  heavyAttackWarning?: string;
  status: string;
  team: Combatant[];
  /** Only authoritative reward status. Never inferred from the illustrated panel. */
  reward?: { status: "pending" | "granted" | "failed"; text: string };
  effect?: { id: string; source: CardId | "boss"; hit: boolean };
}
export interface BattleSnapshot {
  ownedCards: readonly BattleOwnedCard[];
  savedTeamIds: readonly string[];
  minimumTeamSize: number;
  loading: boolean;
  error?: string;
  battle: BattleState | null;
}
/** Install from a shared client provider once ownership / raid services are available.
 * Publish changed immutable snapshots and notify subscribers after each action.
 * attack must validate round server-side; it represents ONE team action.
 */
export interface BattleAdapter {
  getSnapshot(): BattleSnapshot;
  subscribe(listener: () => void): () => void;
  saveTeam(ids: string[]): Promise<void>;
  startRaid(ids: string[]): Promise<void>;
  attack(input: {
    battleId: string;
    round: number;
    instanceId: string;
    skillId: string;
  }): Promise<void>;
}
export function eligible(card: BattleOwnedCard) {
  return card.raidEligible && !card.lockedByListing;
}
export function toggleTeam(
  ids: readonly string[],
  card: BattleOwnedCard,
): string[] {
  if (ids.includes(card.instanceId))
    return ids.filter((id) => id !== card.instanceId);
  if (!eligible(card) || ids.length >= 3) return [...ids];
  return [...ids, card.instanceId];
}
export function teamIssue(
  ids: readonly string[],
  cards: readonly BattleOwnedCard[],
  minimum = 3,
) {
  if (ids.length < minimum)
    return `Choose ${minimum} eligible cards for your raid team.`;
  if (ids.length > 3 || new Set(ids).size !== ids.length)
    return "Update your team: choose up to 3 different owned cards.";
  if (
    ids.some(
      (id) => !cards.some((card) => card.instanceId === id && eligible(card)),
    )
  )
    return "Replace unavailable or Market-listed cards in your team.";
  return null;
}
