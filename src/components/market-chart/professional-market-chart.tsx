import { memo, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { movingAverageSeries, type BuyTimingMarker } from "@/quant/buy-timing";
import type { DailyBar } from "@/quant/types";

interface ProfessionalMarketChartProps {
  bars: DailyBar[];
  markers?: BuyTimingMarker[];
  height?: number;
  className?: string;
}

export const ProfessionalMarketChart = memo(function ProfessionalMarketChart({
  bars,
  markers = [],
  height = 430,
  className,
}: ProfessionalMarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  const sortedBars = useMemo(
    () => [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
    [bars],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || sortedBars.length === 0) return;

    const dark = document.documentElement.classList.contains("dark");
    const palette = dark
      ? {
          background: "#0e131b",
          text: "#7f8b99",
          grid: "rgba(124, 139, 157, 0.10)",
          border: "rgba(124, 139, 157, 0.18)",
          up: "#36b77a",
          down: "#df6270",
          primary: "#4f8df7",
          secondary: "#8490a0",
        }
      : {
          background: "#fbfcfd",
          text: "#697586",
          grid: "rgba(71, 85, 105, 0.10)",
          border: "rgba(71, 85, 105, 0.16)",
          up: "#198754",
          down: "#c43b50",
          primary: "#2563d9",
          secondary: "#64748b",
        };

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
        fontFamily: '"Geist Mono Variable", monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(79, 141, 247, 0.48)",
          width: 1,
          style: 2,
          labelBackgroundColor: palette.primary,
        },
        horzLine: {
          color: "rgba(127, 139, 153, 0.32)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#354052",
        },
      },
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: { top: 0.08, bottom: 0.27 },
        minimumWidth: 72,
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: false,
        rightOffset: 2,
        barSpacing: Math.max(9, Math.min(18, 720 / sortedBars.length)),
        minBarSpacing: 5,
        fixLeftEdge: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      localization: {
        locale: "zh-CN",
        priceFormatter: (price: number) =>
          price.toFixed(price > 100 ? 2 : 3),
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    candleSeries.setData(
      sortedBars.map((bar) => ({
        time: bar.tradeDate as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeries.setData(
      sortedBars.map((bar) => ({
        time: bar.tradeDate as Time,
        value: bar.volume,
        color:
          bar.close >= bar.open
            ? dark
              ? "rgba(54, 183, 122, 0.30)"
              : "rgba(25, 135, 84, 0.25)"
            : dark
              ? "rgba(223, 98, 112, 0.30)"
              : "rgba(196, 59, 80, 0.25)",
      })),
    );

    const ma5Series = chart.addSeries(LineSeries, {
      color: palette.primary,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ma20Series = chart.addSeries(LineSeries, {
      color: palette.secondary,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ma5 = movingAverageSeries(sortedBars, 5);
    const ma20 = movingAverageSeries(sortedBars, 20);
    ma5Series.setData(
      sortedBars.flatMap((bar, index) =>
        ma5[index] === null
          ? []
          : [{ time: bar.tradeDate as Time, value: ma5[index]! }],
      ),
    );
    ma20Series.setData(
      sortedBars.flatMap((bar, index) =>
        ma20[index] === null
          ? []
          : [{ time: bar.tradeDate as Time, value: ma20[index]! }],
      ),
    );

    createSeriesMarkers(
      candleSeries,
      markers.map((marker) => ({
        time: marker.tradeDate as Time,
        position: "belowBar" as const,
        color: palette.up,
        shape: "arrowUp" as const,
        text: marker.label,
        size: 1.2,
      })),
    );

    const latest = sortedBars.at(-1)!;
    const renderLegend = (bar = latest) => {
      if (!legendRef.current) return;
      const change = ((bar.close - bar.open) / bar.open) * 100;
      legendRef.current.innerHTML = [
        `<span>${bar.tradeDate}</span>`,
        `<span>开 <strong>${bar.open.toFixed(3)}</strong></span>`,
        `<span>高 <strong>${bar.high.toFixed(3)}</strong></span>`,
        `<span>低 <strong>${bar.low.toFixed(3)}</strong></span>`,
        `<span>收 <strong>${bar.close.toFixed(3)}</strong></span>`,
        `<span style="color:${change >= 0 ? palette.up : palette.down}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span>`,
      ].join("");
    };
    renderLegend();
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        renderLegend();
        return;
      }
      const data = param.seriesData.get(candleSeries);
      if (data && "open" in data) {
        const date =
          typeof param.time === "string"
            ? param.time
            : typeof param.time === "number"
              ? new Date(param.time * 1000).toISOString().slice(0, 10)
              : `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}`;
        renderLegend({
          ...latest,
          tradeDate: date,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        });
      }
    });

    chart.timeScale().fitContent();
    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height, markers, sortedBars]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 110, damping: 20 }}
      className={className}
    >
      <div
        ref={legendRef}
        className="flex h-9 items-center gap-3 overflow-hidden border-b border-border/70 bg-background-elevated/75 px-3 font-mono text-[10px] text-foreground-subtle [&_strong]:font-medium [&_strong]:text-foreground"
      />
      <div ref={containerRef} className="w-full" style={{ height }} />
    </motion.div>
  );
});
