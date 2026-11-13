import type { BattleState } from "@/app/battle/battle-interface";
import type { CardId } from "@/app/collection/card-catalog";
export interface ChainCard {
  token_id: string;
  card_id: CardId;
  barcode: string;
  owner_id: string;
}
export interface ChainPlayer {
  cards: ChainCard[];
  shards: string;
  usdc_credit: string;
  discoveries: number;
  first_win: boolean;
  starter_claimed?: boolean;
  claims: string[];
  locked_ids: string[];
  raid: BattleState | null;
}
export interface ChainConfig {
  owner_id: string;
  usdc_contract_id: string;
  tomo_account_id: string;
  koban_account_id: string;
  tomo_budget: string;
  koban_budget: string;
  distributed: string;
}
export interface ShopItem {
  cardId: CardId;
  inStock: boolean;
  stockCount: number;
  buy_price: string;
  sell_price: string;
}
export interface ChainListing {
  listing: { id: string; seller: string; token_id: string; price: string };
  card: ChainCard;
}
export type TxKind =
  | "mint"
  | "quest"
  | "buy"
  | "sell"
  | "loot"
  | "raid"
  | "storage"
  | "faucet"
  | "list"
  | "cancel"
  | "withdraw"
  | "transaction";
export interface ChainTx {
  hash: string;
  accountId: string;
  kind: TxKind;
  title: string;
  timestamp: number;
  status: "pending" | "success" | "failed";
  detail?: string;
  receiverId?: string;
}
export interface Call {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit?: string;
  gas?: string;
}
