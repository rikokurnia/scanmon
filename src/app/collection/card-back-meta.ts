import type { CardId } from "./card-catalog";

export type TokenFeedSource =
  | {
      kind: "cex";
      binanceSymbol: string;
      okxInstId: string;
      coingeckoId: string;
      logoUrl: string;
    }
  | {
      kind: "dex";
      network: string;
      poolAddress: string;
      dexscreenerChain: string;
      fallbackLogoUrl: string;
    };

export interface CardBackMeta {
  stars: 1 | 3 | 4;
  tagline: string;
  ticker: string;
  tokenName: string;
  feed: TokenFeedSource;
}

export const CARD_BACK_META: Record<CardId, CardBackMeta> = {
  pepe: {
    stars: 3,
    tagline: "A calm collector with a mischievous streak.",
    ticker: "PEPE",
    tokenName: "Pepe",
    feed: {
      kind: "cex",
      binanceSymbol: "PEPEUSDT",
      okxInstId: "PEPE-USDT",
      coingeckoId: "pepe",
      logoUrl:
        "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
    },
  },
  doge: {
    stars: 3,
    tagline: "Heavy lifts, golden fur, unstoppable meme power.",
    ticker: "DOGE",
    tokenName: "Dogecoin",
    feed: {
      kind: "cex",
      binanceSymbol: "DOGEUSDT",
      okxInstId: "DOGE-USDT",
      coingeckoId: "dogecoin",
      logoUrl:
        "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
    },
  },
  pikachu: {
    stars: 3,
    tagline: "Sparks fly fast whenever trouble draws near.",
    ticker: "PIKACHU",
    tokenName: "Pikachu",
    feed: {
      kind: "dex",
      network: "eth",
      poolAddress: "0x5d2c95651E0EE953b9aBD8eC47Ce2A165c852aE9",
      dexscreenerChain: "ethereum",
      fallbackLogoUrl:
        "https://cdn.dexscreener.com/cms/images/JIuwn6HHQwjiksOV?width=400&height=400&quality=95&format=auto",
    },
  },
  veemon: {
    stars: 3,
    tagline: "Fearless rookie ready to charge any raid.",
    ticker: "DIGIMON",
    tokenName: "Digimon",
    feed: {
      kind: "dex",
      network: "solana",
      poolAddress: "7qD4J6KhTxM45SwgL4cki9FUgurUw5mwictg4PHT73Gn",
      dexscreenerChain: "solana",
      fallbackLogoUrl:
        "https://cdn.dexscreener.com/cms/images/9cbc5fc7a259efd2fd24a5fa47cf216301ed2f91269884a79fdf1fdd5a42fb65?width=400&height=400&quality=95&format=auto",
    },
  },
  "nyan-cat": {
    stars: 1,
    tagline: "Leaves a rainbow trail across deep space.",
    ticker: "NYAN",
    tokenName: "Nyan Cat",
    feed: {
      kind: "dex",
      network: "solana",
      poolAddress: "EaRqg8VQP8xrJx9HpKk46rbWPK3b55UyQKzWU9b4rdK2",
      dexscreenerChain: "solana",
      fallbackLogoUrl:
        "https://cdn.dexscreener.com/cms/images/653a4e7c8e1b54e8ee9918178888fcc797a37ed3209617d9bdbf3a22f5207542?width=400&height=400&quality=95&format=auto",
    },
  },
  gengar: {
    stars: 1,
    tagline: "Grins from the shadows before striking first.",
    ticker: "GENGAR",
    tokenName: "Gengar",
    feed: {
      kind: "dex",
      network: "pulsechain",
      poolAddress: "0xA5924f9D4abc217f6Af0B1335F84d3643C941de3",
      dexscreenerChain: "pulsechain",
      fallbackLogoUrl:
        "https://cdn.dexscreener.com/cms/images/7ba9a2a30cba36365ca213bac93c44c5239e7ad285cfa571703debd1ea7d1307?width=400&height=400&quality=95&format=auto",
    },
  },
  piyomon: {
    stars: 1,
    tagline: "Glides over canyon winds with fiery spirit.",
    ticker: "DIGIMON",
    tokenName: "Digimon",
    feed: {
      kind: "dex",
      network: "solana",
      poolAddress: "7qD4J6KhTxM45SwgL4cki9FUgurUw5mwictg4PHT73Gn",
      dexscreenerChain: "solana",
      fallbackLogoUrl:
        "https://cdn.dexscreener.com/cms/images/9cbc5fc7a259efd2fd24a5fa47cf216301ed2f91269884a79fdf1fdd5a42fb65?width=400&height=400&quality=95&format=auto",
    },
  },
  "chill-guy": {
    stars: 1,
    tagline: "Unbothered by raids, steady on every dock.",
    ticker: "CHILLGUY",
    tokenName: "Just a chill guy",
    feed: {
      kind: "dex",
      network: "solana",
      poolAddress: "93tjgwff5Ac5ThyMi8C4WejVVQq4tuMeMuYW1LEYZ7bu",
      dexscreenerChain: "solana",
      fallbackLogoUrl:
        "https://cdn.dexscreener.com/cms/images/20ae19e21d577f3aead6ae8722a7a3a66c5376cbf11f10d278807bef32551b46?width=400&height=400&quality=95&format=auto",
    },
  },
  "almarts27-hamster-boss": {
    stars: 4,
    tagline: "Apex rainbow sovereign of the scanMon arena.",
    ticker: "HMSTR",
    tokenName: "Hamster Kombat",
    feed: {
      kind: "cex",
      binanceSymbol: "HMSTRUSDT",
      okxInstId: "HMSTR-USDT",
      coingeckoId: "hamster-kombat",
      logoUrl:
        "https://coin-images.coingecko.com/coins/images/39102/large/hamster-removebg-preview.png",
    },
  },
};

export function formatContractShort(contractId: string): string {
  const trimmed = contractId.trim();
  if (!trimmed) return "cards...near";
  if (trimmed.length <= 18) return trimmed;
  const dotIdx = trimmed.lastIndexOf(".");
  if (dotIdx > 0) {
    const suffix = trimmed.slice(dotIdx + 1);
    const prefix = trimmed.slice(0, Math.min(7, dotIdx));
    return `${prefix}...${suffix}`;
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-5)}`;
}

export function formatTokenUsdPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "$0.00";
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  // Count leading zeros after decimal for micro-cap tokens
  const fixed = price.toFixed(12);
  const match = fixed.match(/^0\.(0*)(\d{1,4})/);
  if (match) {
    return `$0.${match[1]}${match[2]}`;
  }
  return `$${price.toPrecision(3)}`;
}
