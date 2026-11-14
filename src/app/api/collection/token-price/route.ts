import { NextRequest, NextResponse } from "next/server";
import { isKnownCardId } from "@/app/collection/card-catalog";
import { CARD_BACK_META } from "@/app/collection/card-back-meta";

export interface TokenPricePoint {
  time: number;
  value: number;
}

export interface TokenPriceResponse {
  cardId: string;
  ticker: string;
  tokenName: string;
  logoUrl: string;
  priceUsd: number;
  change24hPct: number | null;
  points: TokenPricePoint[];
  source: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 120_000;
const cache = new Map<string, { expiresAt: number; data: TokenPriceResponse }>();

function normalizePoints(raw: TokenPricePoint[]): TokenPricePoint[] {
  const byTime = new Map<number, number>();
  for (const pt of raw) {
    if (Number.isFinite(pt.time) && Number.isFinite(pt.value) && pt.value > 0) {
      byTime.set(Math.floor(pt.time), pt.value);
    }
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCexToken(
  cardId: string,
  meta: (typeof CARD_BACK_META)[keyof typeof CARD_BACK_META],
): Promise<TokenPriceResponse> {
  if (meta.feed.kind !== "cex") {
    throw new Error("Invalid CEX feed configuration");
  }

  // Primary: OKX 4H candles (42 * 4h = 7D) + ticker (globally accessible)
  try {
    const [candles, ticker] = await Promise.all([
      fetchJsonWithTimeout<{ data?: string[][] }>(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(meta.feed.okxInstId)}&bar=4H&limit=42`,
      ),
      fetchJsonWithTimeout<{ data?: Array<{ last?: string; open24h?: string }> }>(
        `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(meta.feed.okxInstId)}`,
      ),
    ]);

    const points = normalizePoints(
      (candles.data ?? []).map((row) => ({
        time: Math.floor(Number(row[0]) / 1000),
        value: Number(row[4]),
      })),
    );

    const last = Number(ticker.data?.[0]?.last ?? points.at(-1)?.value ?? 0);
    const open24h = Number(ticker.data?.[0]?.open24h ?? 0);
    const change24hPct =
      open24h > 0 && last > 0 ? ((last - open24h) / open24h) * 100 : null;

    if (points.length >= 2 && last > 0) {
      return {
        cardId,
        ticker: meta.ticker,
        tokenName: meta.tokenName,
        logoUrl: meta.feed.logoUrl,
        priceUsd: last,
        change24hPct,
        points,
        source: "OKX",
        fetchedAt: Date.now(),
      };
    }
  } catch {
    // Fall through to Binance
  }

  // Fallback 1: Binance 4H klines (42 * 4h = 7D) + 24hr ticker
  try {
    const [klines, ticker24] = await Promise.all([
      fetchJsonWithTimeout<Array<[number, string, string, string, string]>>(
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(meta.feed.binanceSymbol)}&interval=4h&limit=42`,
      ),
      fetchJsonWithTimeout<{ lastPrice?: string; priceChangePercent?: string }>(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(meta.feed.binanceSymbol)}`,
      ),
    ]);

    const points = normalizePoints(
      klines.map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        value: Number(k[4]),
      })),
    );
    const last = Number(ticker24.lastPrice ?? points.at(-1)?.value ?? 0);
    const pct = ticker24.priceChangePercent
      ? Number(ticker24.priceChangePercent)
      : null;

    if (points.length >= 2 && last > 0) {
      return {
        cardId,
        ticker: meta.ticker,
        tokenName: meta.tokenName,
        logoUrl: meta.feed.logoUrl,
        priceUsd: last,
        change24hPct: Number.isFinite(pct) ? pct : null,
        points,
        source: "Binance",
        fetchedAt: Date.now(),
      };
    }
  } catch {
    // Fall through to CoinGecko
  }

  // Fallback 2: CoinGecko 7D market_chart
  const cg = await fetchJsonWithTimeout<{ prices?: Array<[number, number]> }>(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(meta.feed.coingeckoId)}/market_chart?vs_currency=usd&days=7`,
  );
  const points = normalizePoints(
    (cg.prices ?? []).map(([ts, val]) => ({
      time: Math.floor(ts / 1000),
      value: val,
    })),
  );
  const last = points.at(-1)?.value ?? 0;
  if (points.length < 2 || last <= 0) {
    throw new Error("Insufficient CoinGecko price points");
  }
  return {
    cardId,
    ticker: meta.ticker,
    tokenName: meta.tokenName,
    logoUrl: meta.feed.logoUrl,
    priceUsd: last,
    change24hPct: null,
    points,
    source: "CoinGecko",
    fetchedAt: Date.now(),
  };
}

async function fetchDexToken(
  cardId: string,
  meta: (typeof CARD_BACK_META)[keyof typeof CARD_BACK_META],
): Promise<TokenPriceResponse> {
  if (meta.feed.kind !== "dex") {
    throw new Error("Invalid DEX feed configuration");
  }

  const [dsResult, gtResult] = await Promise.allSettled([
    fetchJsonWithTimeout<{
      pair?: {
        baseToken?: { symbol?: string; name?: string };
        priceUsd?: string;
        priceChange?: { h24?: number };
        info?: { imageUrl?: string };
      };
    }>(
      `https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(meta.feed.dexscreenerChain)}/${encodeURIComponent(meta.feed.poolAddress)}`,
    ),
    fetchJsonWithTimeout<{
      data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number]> } };
    }>(
      `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(meta.feed.network)}/pools/${encodeURIComponent(meta.feed.poolAddress)}/ohlcv/hour?limit=168`,
    ),
  ]);

  let ohlcvList =
    gtResult.status === "fulfilled"
      ? (gtResult.value.data?.attributes?.ohlcv_list ?? [])
      : [];

  // Fallback to daily OHLCV if hourly is rate-limited or sparse
  if (ohlcvList.length < 2) {
    const dayRes = await fetchJsonWithTimeout<{
      data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number]> } };
    }>(
      `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(meta.feed.network)}/pools/${encodeURIComponent(meta.feed.poolAddress)}/ohlcv/day?limit=14`,
    );
    ohlcvList = dayRes.data?.attributes?.ohlcv_list ?? [];
  }

  const points = normalizePoints(
    ohlcvList.map((row) => ({
      time: Number(row[0]),
      value: Number(row[4]),
    })),
  );

  const dsPair = dsResult.status === "fulfilled" ? dsResult.value.pair : undefined;
  const dsPrice = dsPair?.priceUsd ? Number(dsPair.priceUsd) : 0;
  const lastPrice = dsPrice > 0 ? dsPrice : (points.at(-1)?.value ?? 0);

  if (points.length < 2 || lastPrice <= 0) {
    throw new Error("Insufficient DEX price points");
  }

  return {
    cardId,
    ticker: dsPair?.baseToken?.symbol?.toUpperCase() || meta.ticker,
    tokenName: dsPair?.baseToken?.name || meta.tokenName,
    logoUrl: dsPair?.info?.imageUrl || meta.feed.fallbackLogoUrl,
    priceUsd: lastPrice,
    change24hPct:
      typeof dsPair?.priceChange?.h24 === "number"
        ? dsPair.priceChange.h24
        : null,
    points,
    source: "GeckoTerminal",
    fetchedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get("cardId") ?? "";
  if (!isKnownCardId(cardId)) {
    return NextResponse.json({ error: "Unknown cardId" }, { status: 400 });
  }

  const cached = cache.get(cardId);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  }

  const meta = CARD_BACK_META[cardId];
  try {
    const data =
      meta.feed.kind === "cex"
        ? await fetchCexToken(cardId, meta)
        : await fetchDexToken(cardId, meta);

    cache.set(cardId, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    if (cached) {
      return NextResponse.json(cached.data);
    }
    return NextResponse.json(
      {
        error: "Live price unavailable",
        detail: err instanceof Error ? err.message : "Upstream feed error",
      },
      { status: 502 },
    );
  }
}
