import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  init,
  dispose,
  registerLocale,
  registerStyles,
  type Chart,
  type KLineData,
  type Styles,
  type DeepPartial,
} from "klinecharts";
import type { DailyBar } from "@/quant/types";
import type { BuyTimingMarker } from "@/quant/buy-timing";
import { buildBuyTimingMarkers } from "@/quant/buy-timing";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface ProfessionalMarketChartProps {
  bars: DailyBar[];
  markers?: BuyTimingMarker[];
  height?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Palette                                                           */
/* ------------------------------------------------------------------ */
interface ChartPalette {
  background: string;
  text: string;
  grid: string;
  border: string;
  up: string;
  down: string;
  primary: string;
  secondary: string;
}

const darkPalette: ChartPalette = {
  background: "#0b1018",
  text: "#8b95a5",
  grid: "rgba(95,105,125,0.12)",
  border: "rgba(95,105,125,0.22)",
  up: "#26a69a",
  down: "#ef5350",
  primary: "#5c8df7",
  secondary: "#8b95a5",
};

const lightPalette: ChartPalette = {
  background: "#f8f9fb",
  text: "#697586",
  grid: "rgba(71,85,105,0.10)",
  border: "rgba(71,85,105,0.18)",
  up: "#16a34a",
  down: "#dc2626",
  primary: "#3b66f0",
  secondary: "#8490a0",
};

/* ------------------------------------------------------------------ */
/*  Locale                                                            */
/* ------------------------------------------------------------------ */
registerLocale("zh-CN", {
  time: "时间",
  open: "开",
  high: "高",
  low: "低",
  close: "收",
  volume: "量",
  change: "幅",
  turnover: "额",
  second: "秒",
  minute: "分",
  hour: "时",
  day: "日",
  week: "周",
  month: "月",
  year: "年",
});

/* ------------------------------------------------------------------ */
/*  Named styles (registered once globally)                           */
/* ------------------------------------------------------------------ */
registerStyles("quantsift-dark", buildStyles(darkPalette));
registerStyles("quantsift-light", buildStyles(lightPalette));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function toTimestamp(dateStr: string): number {
  return new Date(dateStr + "T00:00:00+08:00").getTime();
}

function barsToKLineData(bars: DailyBar[]): KLineData[] {
  return bars.map((bar) => ({
    timestamp: toTimestamp(bar.tradeDate),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

/* ------------------------------------------------------------------ */
/*  Styles factory                                                    */
/* ------------------------------------------------------------------ */
function buildStyles(palette: ChartPalette): DeepPartial<Styles> {
  return {
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: palette.grid, style: "dashed", dashedValue: [4, 4] },
      vertical: { show: false, size: 1, color: palette.grid, style: "solid", dashedValue: [0, 0] },
    },
    candle: {
      type: "candle_solid",
      bar: {
        compareRule: "current_open",
        upColor: palette.up,
        downColor: palette.down,
        noChangeColor: palette.secondary,
        upBorderColor: palette.up,
        downBorderColor: palette.down,
        noChangeBorderColor: palette.secondary,
        upWickColor: palette.up,
        downWickColor: palette.down,
        noChangeWickColor: palette.secondary,
      },
      priceMark: {
        show: true,
        high: { show: false, color: "", textOffset: 0, textSize: 0, textFamily: "", textWeight: "" },
        low: { show: false, color: "", textOffset: 0, textSize: 0, textFamily: "", textWeight: "" },
        last: {
          show: true,
          compareRule: "current_open",
          upColor: palette.up,
          downColor: palette.down,
          noChangeColor: palette.secondary,
          line: { show: true, size: 1, color: palette.text, dashedValue: [2, 4] } as any,
          text: {
            show: true,
            color: palette.text,
            size: 11,
            family: '"Geist Mono Variable", monospace',
            weight: "500",
            paddingLeft: 6,
            paddingTop: 2,
            paddingRight: 6,
            paddingBottom: 2,
            borderRadius: 3,
          } as any,
          extendTexts: [],
        },
      },
      tooltip: {
        showRule: "follow_cross",
        showType: "standard",
        offsetLeft: 8,
        offsetTop: 8,
        features: [],
        title: {
          show: true,
          template: "{time}",
          color: palette.text,
          size: 11,
          family: '"Geist Mono Variable", monospace',
          weight: "500",
          marginLeft: 10,
          marginTop: 6,
          marginRight: 10,
          marginBottom: 2,
        } as any,
        legend: {
          defaultValue: "--",
          color: palette.text,
          size: 10,
          family: '"Geist Mono Variable", monospace',
          weight: "400",
          marginLeft: 10,
          marginTop: 0,
          marginRight: 10,
          marginBottom: 6,
        } as any,
      },
    },
    indicator: {
      ohlc: { compareRule: "current_open", upColor: palette.up, downColor: palette.down, noChangeColor: palette.secondary },
      bars: [],
      lines: [],
      circles: [],
      texts: [],
      lastValueMark: { show: false, text: { show: false } as any },
      tooltip: {
        showRule: "follow_cross",
        features: [],
        title: { show: true, showName: true, showParams: true } as any,
        legend: {
          defaultValue: "--",
          color: palette.text,
          size: 10,
          family: '"Geist Mono Variable", monospace',
          weight: "400",
          marginLeft: 10,
          marginTop: 0,
          marginRight: 10,
          marginBottom: 6,
        } as any,
      },
    },
    xAxis: {
      show: true,
      size: "auto",
      axisLine: { show: false, color: palette.border, size: 1 },
      tickLine: { show: false, color: palette.border, length: 4, size: 1 },
      tickText: {
        show: true,
        color: palette.text,
        size: 10,
        family: '"Geist Mono Variable", monospace',
        weight: "400",
        marginStart: 4,
        marginEnd: 4,
      },
    },
    yAxis: {
      show: true,
      size: "auto",
      axisLine: { show: false, color: palette.border, size: 1 },
      tickLine: { show: false, color: palette.border, length: 4, size: 1 },
      tickText: {
        show: true,
        color: palette.text,
        size: 10,
        family: '"Geist Mono Variable", monospace',
        weight: "400",
        marginStart: 4,
        marginEnd: 4,
      },
    },
    separator: {
      size: 1,
      color: palette.border,
      fill: true,
      activeBackgroundColor: "rgba(92,141,247,0.06)",
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        features: [],
        line: { show: true, style: "dashed", size: 1, color: "rgba(127,139,153,0.35)", dashedValue: [4, 4] },
        text: {
          show: true,
          color: "#ffffff",
          size: 10,
          family: '"Geist Mono Variable", monospace',
          weight: "500",
          paddingLeft: 6,
          paddingTop: 2,
          paddingRight: 6,
          paddingBottom: 2,
          borderRadius: 3,
          backgroundColor: "#354052",
          borderSize: 0,
          borderColor: "",
          borderStyle: "solid",
          borderDashedValue: [0, 0],
          style: "stroke_fill",
        } as any,
      },
      vertical: {
        show: true,
        line: { show: true, style: "dashed", size: 1, color: "rgba(92,141,247,0.50)", dashedValue: [4, 4] },
        text: {
          show: true,
          color: "#ffffff",
          size: 10,
          family: '"Geist Mono Variable", monospace',
          weight: "500",
          paddingLeft: 6,
          paddingTop: 2,
          paddingRight: 6,
          paddingBottom: 2,
          borderRadius: 3,
          backgroundColor: palette.primary,
          borderSize: 0,
          borderColor: "",
          borderStyle: "solid",
          borderDashedValue: [0, 0],
          style: "stroke_fill",
        } as any,
      },
    },
  } as DeepPartial<Styles>;
}

/* ------------------------------------------------------------------ */
/*  Legend bar                                                        */
/* ------------------------------------------------------------------ */
function LegendBar({ bars }: { bars: DailyBar[] }) {
  const latest = bars.at(-1);
  if (!latest) return null;
  const change = ((latest.close - latest.open) / latest.open) * 100;
  const up = change >= 0;
  const changeColor = up ? "#22c58b" : "#ef5350";

  return (
    <div className="flex h-9 items-center gap-3 overflow-hidden border-b border-border/70 bg-background-elevated/75 px-3 font-mono text-[10px] text-foreground-subtle [&_strong]:font-medium [&_strong]:text-foreground">
      <span>{latest.tradeDate}</span>
      <span>开 <strong>{latest.open.toFixed(3)}</strong></span>
      <span>高 <strong>{latest.high.toFixed(3)}</strong></span>
      <span>低 <strong>{latest.low.toFixed(3)}</strong></span>
      <span>收 <strong>{latest.close.toFixed(3)}</strong></span>
      <span style={{ color: changeColor }}>{up ? "+" : ""}{change.toFixed(2)}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export const ProfessionalMarketChart = memo(function ProfessionalMarketChart({
  bars,
  markers: externalMarkers,
  height = 430,
  className,
}: ProfessionalMarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [mode, setMode] = useState(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  const sortedBars = useMemo(
    () => [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
    [bars],
  );
  const klineData = useMemo(() => barsToKLineData(sortedBars), [sortedBars]);

  // Calculate optimal barSpace to fill the container
  const barCount = sortedBars.length;

  // Listen for dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      setMode(dark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // ── Chart lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || klineData.length === 0) return;

    // Dispose previous instance
    if (chartRef.current) {
      try { dispose(container); } catch { /* ok */ }
    }

    const palette = mode === "dark" ? darkPalette : lightPalette;

    // Compute barSpace so that barCount * barSpace ≈ container width - yAxis width
    const yAxisReserve = 68;
    const targetSpace = Math.max(4, Math.min(30, (container.clientWidth - yAxisReserve) / (barCount + 1)));

    const chart = init(container, {
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      styles: mode === "dark" ? "quantsift-dark" : "quantsift-light",
      layout: {
        barSpaceLimit: { min: 4, max: 30 },
        pane: { minHeight: 60, dragEnabled: true },
        yAxis: {
          position: "right",
          inside: false,
          reverse: false,
          scrollZoomEnabled: true,
          gap: { top: 0.12, bottom: 0.25 },
          needWidget: true,
        },
      },
    });

    if (!chart) return;
    chartRef.current = chart;

    // Configure symbol and period
    chart.setSymbol({
      ticker: bars[0]?.instrumentId ?? "instrument",
      pricePrecision: 3,
      volumePrecision: 0,
    });
    chart.setPeriod({ span: 1, type: "day" });

    // Static data — no pagination
    chart.setDataLoader({
      getBars: ({ callback }) => {
        callback(klineData, false);
      },
    });

    // Use external markers or compute from bars
    const markers = externalMarkers ?? buildBuyTimingMarkers(sortedBars);

    // Set barSpace explicitly after data is loaded (override layout auto)
    chart.setBarSpace(targetSpace);

    // Indicators
    chart.createIndicator({ name: "MA", calcParams: [5], paneId: "candle_pane" });
    chart.createIndicator({ name: "MA", calcParams: [20], paneId: "candle_pane" });
    chart.createIndicator("VOL");

    // MACD sub-pane (12, 26, 9)
    chart.createIndicator({ name: "MACD", calcParams: [12, 26, 9] });

    // KDJ sub-pane (9, 3, 3)
    chart.createIndicator({ name: "KDJ", calcParams: [9, 3, 3] });

    // RSI (14)
    chart.createIndicator({ name: "RSI", calcParams: [14] });

    // BOLL (20, 2)
    chart.createIndicator({ name: "BOLL", calcParams: [20, 2], paneId: "candle_pane" });

    // ── Buy-timing signal overlays ────────────────────────────────
    if (markers.length > 0) {
      for (const marker of markers) {
        const ts = toTimestamp(marker.tradeDate);
        // Use simpleAnnotation — an upward-pointing arrow + text above price
        chart.createOverlay({
          name: "simpleAnnotation",
          groupId: "buy_signals",
          paneId: "candle_pane",
          points: [{ timestamp: ts }],
          extendData: marker.label,
          styles: {
            polygon: {
              color: marker.kind === "trend_breakout" ? "#22c58b" : palette.primary,
              borderColor: marker.kind === "trend_breakout" ? "#22c58b" : palette.primary,
              borderSize: 1,
              style: "fill",
            },
            line: {
              color: marker.kind === "trend_breakout" ? "rgba(34,197,139,0.7)" : `rgba(92,141,247,0.6)`,
              style: "dashed",
              size: 1,
            },
          } as any,
        });
      }
    }

    // Resize handling
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      dispose(container);
      chartRef.current = null;
    };
  }, [klineData, mode, bars, height, barCount]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 110, damping: 20 }}
      className={className}
    >
      <LegendBar bars={sortedBars} />
      <div ref={containerRef} className="w-full" style={{ height }} />
    </motion.div>
  );
});
