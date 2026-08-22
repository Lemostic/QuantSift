import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  init,
  dispose,
  registerLocale,
  registerStyles,
  type Chart,
  type Crosshair,
  type KLineData,
  type Styles,
  type DeepPartial,
} from "klinecharts";
import type { DailyBar, Instrument } from "@/quant/types";
import type { BuyTimingMarker, SellTimingMarker } from "@/quant/buy-timing";
import { buildBuyTimingMarkers, buildSellTimingMarkers } from "@/quant/buy-timing";
import type { KeyPoint } from "@/quant/key-points";
import { computeFillBarSpace, computeLegendStats, filterBarsUpToToday } from "@/quant/indicators";
import { KeyPointPanel } from "./key-point-panel";

/* 指标配色：图例与图表线条共用同一套色值，保证所见即所注。 */
export const CHART_COLORS = {
  ma5: "#f0b90b",
  ma20: "#3b82f6",
  boll: "#c084fc",
  macdDif: "#f0b90b",
  macdDea: "#3b82f6",
  kdjK: "#c084fc",
  kdjD: "#fbbf24",
  kdjJ: "#60a5fa",
  rsi: "#f0b90b",
  up: "#22c58b",
  down: "#ef5350",
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface ProfessionalMarketChartProps {
  bars: DailyBar[];
  markers?: BuyTimingMarker[];
  sellMarkers?: SellTimingMarker[];
  /** 关键点（本地规则识别）；悬停标记显示分析面板。 */
  keyPoints?: KeyPoint[];
  /** 悬停面板 AI 深度分析所需的标的（未传则不显示面板）。 */
  instrument?: Instrument | null;
  /** 面板上 "AI 分析此点" 按钮开关。 */
  aiDeepEnabled?: boolean;
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
function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number | string | null;
}) {
  if (value === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <i className="inline-block h-[3px] w-3 rounded-full" style={{ background: color }} />
      <span className="text-foreground-muted">{label}</span>
      <strong>{typeof value === "number" ? value.toFixed(2) : value}</strong>
    </span>
  );
}

function LegendBar({ bars }: { bars: DailyBar[] }) {
  const stats = useMemo(() => computeLegendStats(bars), [bars]);
  if (!stats) return null;
  const up = stats.changePct >= 0;
  const changeColor = up ? CHART_COLORS.up : CHART_COLORS.down;
  const previousClose = stats.close - stats.changeAmount;
  const amplitudePct =
    previousClose > 0 ? ((stats.high - stats.low) / previousClose) * 100 : 0;

  return (
    <div className="flex h-9 items-center gap-x-3 gap-y-0 overflow-x-auto whitespace-nowrap border-b border-border/70 bg-background-elevated/75 px-3 font-mono text-[10px] text-foreground-subtle [&_strong]:font-medium [&_strong]:text-foreground">
      <span className="shrink-0">{stats.tradeDate}</span>
      <span
        className="shrink-0 text-[11px] font-semibold"
        style={{ color: changeColor }}
      >
        {stats.close.toFixed(3)}
      </span>
      <span className="shrink-0" style={{ color: changeColor }}>
        {up ? "+" : ""}
        {stats.changePct.toFixed(2)}%
      </span>
      <span className="shrink-0 text-foreground-subtle">
        振幅 <strong>{amplitudePct.toFixed(2)}%</strong>
      </span>
      <LegendItem color={CHART_COLORS.ma5} label="MA5" value={stats.ma5} />
      <LegendItem color={CHART_COLORS.ma20} label="MA20" value={stats.ma20} />
      <LegendItem color={CHART_COLORS.boll} label="BOLL" value={`${stats.bollUpper ?? "--"} / ${stats.bollLower ?? "--"}`} />
      <LegendItem color={CHART_COLORS.macdDif} label="MACD" value={`${stats.macdDif ?? "--"} · ${stats.macdDea ?? "--"} · ${stats.macdHist ?? "--"}`} />
      <LegendItem color={CHART_COLORS.kdjK} label="KDJ" value={`${stats.kdjK ?? "--"} · ${stats.kdjD ?? "--"} · ${stats.kdjJ ?? "--"}`} />
      <LegendItem color={CHART_COLORS.rsi} label="RSI" value={stats.rsi} />
      <span className="shrink-0 text-foreground-subtle">
        量 <strong>{formatVolume(stats.volume)}</strong>
      </span>
    </div>
  );
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}亿`;
  if (volume >= 10_000) return `${(volume / 10_000).toFixed(1)}万`;
  return String(Math.round(volume));
}

/* ------------------------------------------------------------------ */
/*  Crosshair readout                                                 */
/* ------------------------------------------------------------------ */
function CrosshairReadout({
  bar,
  changePct,
}: {
  bar: DailyBar | null;
  changePct: number | null;
}) {
  if (!bar) return null;
  const up = bar.close >= bar.open;
  const color = up ? CHART_COLORS.up : CHART_COLORS.down;
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-border/60 bg-background-overlay/90 px-2.5 py-1.5 font-mono text-[9px] leading-4 text-foreground-muted shadow-diffusion-sm backdrop-blur-sm">
      <div className="font-semibold text-foreground">
        {bar.tradeDate}
        {changePct !== null && (
          <span className="ml-2" style={{ color: changePct >= 0 ? CHART_COLORS.up : CHART_COLORS.down }}>
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <span>
          开 <strong style={{ color }}>{bar.open.toFixed(3)}</strong>
        </span>
        <span>
          高 <strong style={{ color: CHART_COLORS.up }}>{bar.high.toFixed(3)}</strong>
        </span>
        <span>
          低 <strong style={{ color: CHART_COLORS.down }}>{bar.low.toFixed(3)}</strong>
        </span>
        <span>
          收 <strong style={{ color }}>{bar.close.toFixed(3)}</strong>
        </span>
        <span>
          量 <strong>{formatVolume(bar.volume)}</strong>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export const ProfessionalMarketChart = memo(function ProfessionalMarketChart({
  bars,
  markers: externalMarkers,
  sellMarkers: externalSellMarkers,
  keyPoints = [],
  instrument = null,
  aiDeepEnabled = false,
  height = 430,
  className,
}: ProfessionalMarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [mode, setMode] = useState(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  /** 当前悬停命中的关键点（无则 null）。 */
  const [activeKeyPoint, setActiveKeyPoint] = useState<KeyPoint | null>(null);

  const sortedBars = useMemo(
    () =>
      filterBarsUpToToday(
        [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
      ),
    [bars],
  );
  const klineData = useMemo(() => barsToKLineData(sortedBars), [sortedBars]);
  /** 十字光标命中的 K 线；null 表示未悬停（回退显示最新一根）。 */
  const [activeTradeDate, setActiveTradeDate] = useState<string | null>(null);
  /** 只标记可见窗口内的关键点。 */
  const visibleKeyPoints = useMemo(
    () =>
      keyPoints.filter((point) =>
        sortedBars.some((bar) => bar.tradeDate === point.tradeDate),
      ),
    [keyPoints, sortedBars],
  );

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

    const chart = init(container, {
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      styles: mode === "dark" ? "quantsift-dark" : "quantsift-light",
      layout: {
        barSpaceLimit: { min: 4, max: 160 },
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

    // barSpace 精确铺满容器（最后一根紧贴右缘，时间轴不会延伸出未来日期）。
    const applyFill = () => {
      chart.setBarSpace(
        computeFillBarSpace(container.clientWidth, klineData.length),
      );
      chart.resize();
    };

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
    const sellMarkers = externalSellMarkers ?? buildSellTimingMarkers(sortedBars);

    // Set barSpace explicitly after data is loaded (override layout auto)
    applyFill();

    // Indicators —— 显式指定线条颜色，与图例配色保持一致。
    chart.createIndicator({
      name: "MA",
      calcParams: [5],
      paneId: "candle_pane",
      styles: { lines: [{ color: CHART_COLORS.ma5 }] },
    } as never);
    chart.createIndicator({
      name: "MA",
      calcParams: [20],
      paneId: "candle_pane",
      styles: { lines: [{ color: CHART_COLORS.ma20 }] },
    } as never);
    chart.createIndicator("VOL");

    // MACD sub-pane (12, 26, 9)
    chart.createIndicator({
      name: "MACD",
      calcParams: [12, 26, 9],
      styles: {
        lines: [{ color: CHART_COLORS.macdDif }, { color: CHART_COLORS.macdDea }],
      },
    } as never);

    // KDJ sub-pane (9, 3, 3)
    chart.createIndicator({
      name: "KDJ",
      calcParams: [9, 3, 3],
      styles: {
        lines: [
          { color: CHART_COLORS.kdjK },
          { color: CHART_COLORS.kdjD },
          { color: CHART_COLORS.kdjJ },
        ],
      },
    } as never);

    // RSI (14)
    chart.createIndicator({
      name: "RSI",
      calcParams: [14],
      styles: { lines: [{ color: CHART_COLORS.rsi }] },
    } as never);

    // BOLL (20, 2)
    chart.createIndicator({
      name: "BOLL",
      calcParams: [20, 2],
      paneId: "candle_pane",
      styles: {
        lines: [
          { color: CHART_COLORS.boll },
          { color: CHART_COLORS.boll },
          { color: CHART_COLORS.boll },
        ],
      },
    } as never);

    // ── Key-point marker circles ─────────────────────────────────
    for (const point of visibleKeyPoints) {
      const ts = toTimestamp(point.tradeDate);
      const markerColor =
        point.signal === "bullish"
          ? "#22c58b"
          : point.signal === "bearish"
            ? "#f43f5e"
            : "#f0b90b";
      chart.createOverlay({
        name: "circle",
        groupId: "key_points",
        paneId: "candle_pane",
        points: [
          {
            timestamp: ts,
            value: sortedBars.find((bar) => bar.tradeDate === point.tradeDate)?.high ?? 0,
          },
        ],
        styles: {
          circle: {
            color: "rgba(255,255,255,0)",
            borderColor: markerColor,
            borderSize: 2,
          },
        } as never,
      });
    }

    // ── Crosshair readout ─────────────────────────────────────────
    const onCrosshairChange = (data?: unknown) => {
      const crosshair = data as Crosshair | undefined;
      if (!crosshair?.timestamp) {
        setActiveTradeDate(null);
        setActiveKeyPoint(null);
        return;
      }
      const bar = sortedBars.find(
        (candidate) => toTimestamp(candidate.tradeDate) === crosshair.timestamp,
      );
      setActiveTradeDate(bar ? bar.tradeDate : null);
      setActiveKeyPoint(
        bar
          ? (visibleKeyPoints.find(
              (point) => point.tradeDate === bar.tradeDate,
            ) ?? null)
          : null,
      );
    };
    chart.subscribeAction("onCrosshairChange", onCrosshairChange);

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

    // ── Sell-timing signal overlays (rose, mirrored rules) ───────
    if (sellMarkers.length > 0) {
      for (const marker of sellMarkers) {
        const ts = toTimestamp(marker.tradeDate);
        chart.createOverlay({
          name: "simpleAnnotation",
          groupId: "sell_signals",
          paneId: "candle_pane",
          points: [{ timestamp: ts }],
          extendData: marker.label,
          styles: {
            polygon: {
              color: "#f43f5e",
              borderColor: "#f43f5e",
              borderSize: 1,
              style: "fill",
            },
            line: {
              color: "rgba(244,63,94,0.7)",
              style: "dashed",
              size: 1,
            },
          } as any,
        });
      }
    }

    // Resize handling —— 重算铺满间距
    const ro = new ResizeObserver(() => applyFill());
    ro.observe(container);

    return () => {
      ro.disconnect();
      try {
        chart.unsubscribeAction("onCrosshairChange", onCrosshairChange);
      } catch {
        // 图表销毁时订阅可能已随实例释放。
      }
      dispose(container);
      chartRef.current = null;
    };
  }, [klineData, mode, bars, height, barCount, visibleKeyPoints]);

  const readoutBar = useMemo(
    () =>
      sortedBars.find((bar) => bar.tradeDate === activeTradeDate) ??
      sortedBars.at(-1) ??
      null,
    [sortedBars, activeTradeDate],
  );
  const readoutChangePct = useMemo(() => {
    if (!readoutBar) return null;
    const index = sortedBars.findIndex(
      (bar) => bar.tradeDate === readoutBar.tradeDate,
    );
    const previous = index > 0 ? sortedBars[index - 1] : null;
    if (!previous || previous.close === 0) return null;
    return ((readoutBar.close - previous.close) / previous.close) * 100;
  }, [readoutBar, sortedBars]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 110, damping: 20 }}
      className={className}
    >
      <LegendBar bars={sortedBars} />
      <div className="relative">
        <div ref={containerRef} className="w-full" style={{ height }} />
        <CrosshairReadout bar={readoutBar} changePct={readoutChangePct} />
        {activeKeyPoint && instrument && (
          <KeyPointPanel
            point={activeKeyPoint}
            instrument={instrument}
            aiDeepEnabled={aiDeepEnabled}
            onClose={() => setActiveKeyPoint(null)}
          />
        )}
      </div>
    </motion.div>
  );
});
