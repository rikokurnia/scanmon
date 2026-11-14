"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  type IChartApi,
  LineStyle,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import type { CardId } from "./card-catalog";
import { CARD_BACK_META, formatTokenUsdPrice } from "./card-back-meta";
import type { TokenPriceResponse } from "../api/collection/token-price/route";

const clientPriceCache = new Map<string, TokenPriceResponse>();

function formatWeekday(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export default function TokenChart({
  cardId,
  active,
}: {
  cardId: CardId;
  active: boolean;
}) {
  const meta = CARD_BACK_META[cardId];
  const [data, setData] = useState<TokenPriceResponse | null>(
    () => clientPriceCache.get(cardId) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || clientPriceCache.has(cardId)) return;

    let cancelled = false;

    fetch(`/api/collection/token-price?cardId=${encodeURIComponent(cardId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as TokenPriceResponse;
      })
      .then((json) => {
        if (cancelled) return;
        clientPriceCache.set(cardId, json);
        setData(json);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [cardId, active]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data || data.points.length < 2) return;

    let chart: IChartApi | null = createChart(el, {
      width: el.clientWidth || 220,
      height: el.clientHeight || 110,
      layout: {
        background: { type: ColorType.Solid, color: "#07080d" },
        textColor: "#b8bfd4",
        fontFamily: '"Nunito", sans-serif',
        fontSize: 9,
        attributionLogo: true,
      },
      grid: {
        vertLines: {
          color: "rgba(255, 255, 255, 0.08)",
          style: LineStyle.Solid,
        },
        horzLines: {
          color: "rgba(255, 255, 255, 0.08)",
          style: LineStyle.Solid,
        },
      },
      leftPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.14, bottom: 0.12 },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.25)",
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time: number) => formatWeekday(time),
      },
      localization: {
        priceFormatter: (price: number) => formatTokenUsdPrice(price),
      },
      handleScroll: false,
      handleScale: false,
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
    });

    const area = chart.addSeries(AreaSeries, {
      lineColor: "#ff4fa3",
      topColor: "rgba(255, 79, 163, 0.38)",
      bottomColor: "rgba(255, 79, 163, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "custom",
        minMove: 1e-12,
        formatter: (price: number) => formatTokenUsdPrice(price),
      },
    });

    area.setData(
      data.points.map((pt) => ({
        time: pt.time as UTCTimestamp,
        value: pt.value,
      })),
    );
    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chart) return;
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        chart.resize(w, h);
        chart.timeScale().fitContent();
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart?.remove();
      chart = null;
    };
  }, [data]);

  const logoSrc =
    data?.logoUrl ||
    (meta.feed.kind === "cex" ? meta.feed.logoUrl : meta.feed.fallbackLogoUrl);
  const ticker = data?.ticker || meta.ticker;
  const showLogo = Boolean(logoSrc) && failedLogoUrl !== logoSrc;

  return (
    <div className="card-back-chart-box">
      <div className="card-back-chart-header">
        <div className="card-back-token-meta">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${ticker} logo`}
              className="card-back-token-logo"
              referrerPolicy="no-referrer"
              onError={() => setFailedLogoUrl(logoSrc)}
            />
          ) : (
            <span className="card-back-token-fallback" aria-hidden="true">
              {ticker.slice(0, 1)}
            </span>
          )}
          <span className="card-back-token-ticker">{ticker}</span>
          {data ? (
            <span className="card-back-token-price">
              {formatTokenUsdPrice(data.priceUsd)}
            </span>
          ) : null}
        </div>
        <span className="card-back-chart-range">7D</span>
      </div>

      <div className="card-back-chart-canvas-wrap">
        {failed && !data ? (
          <div className="card-back-chart-state">Live price unavailable</div>
        ) : !data ? (
          <div className="card-back-chart-state">Loading {ticker}…</div>
        ) : (
          <div ref={containerRef} className="card-back-chart-canvas" />
        )}
      </div>
    </div>
  );
}
