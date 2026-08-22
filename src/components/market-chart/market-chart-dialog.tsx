import { useEffect, useMemo, useState } from "react";
import { Brain, ChartLineUp, Crosshair, Info, TrendUp } from "@phosphor-icons/react";
import { configuredProvider } from "@/data/provider-registry";
import { buildRecommendation } from "@/quant/recommendation";
import { buildBuyTimingMarkers, buildSellTimingMarkers } from "@/quant/buy-timing";
import { buildSignalIntelligence } from "@/intelligence/signal-intelligence";
import type { DailyBar, Instrument, RecommendationSignal } from "@/quant/types";
import { ProfessionalMarketChart } from "./professional-market-chart";
import { sourceLabel } from "@/data/source-labels";
import { buildKeyPoints } from "@/quant/key-points";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const signalMeta: Record<
  RecommendationSignal,
  { label: string; className: string }
> = {
  buy_watch: {
    label: "买入观察",
    className: "border-accent-emerald/40 text-accent-emerald",
  },
  hold: {
    label: "继续观察",
    className: "border-accent-amber/40 text-accent-amber",
  },
  avoid: {
    label: "暂不交易",
    className: "border-accent-rose/40 text-accent-rose",
  },
};

export function MarketChartDialog({
  instrument,
  open,
  onOpenChange,
}: {
  instrument: Instrument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [bars, setBars] = useState<DailyBar[]>([]);
  const [range, setRange] = useState<7 | 20 | 30 | 60 | 120>(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyPointSetting = useAppStore((state) => state.chartKeyPointAnalysis);

  useEffect(() => {
    if (!open || !instrument) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void configuredProvider()
      .getDailyBars(instrument.id, 120)
      .then((next) => {
        if (!cancelled) setBars(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instrument, open]);

  const recommendation = useMemo(
    () =>
      instrument && bars.length >= 21
        ? buildRecommendation(instrument, bars)
        : null,
    [bars, instrument],
  );
  const markers = useMemo(() => buildBuyTimingMarkers(bars), [bars]);
  const sellMarkers = useMemo(() => buildSellTimingMarkers(bars), [bars]);
  const keyPoints = useMemo(
    () => (keyPointSetting.enabled ? buildKeyPoints(bars) : []),
    [bars, keyPointSetting.enabled],
  );
  const intelligence = useMemo(
    () =>
      recommendation && bars.length >= 21
        ? buildSignalIntelligence(recommendation, bars)
        : null,
    [bars, recommendation],
  );
  const visibleBars = bars.slice(-range);
  const visibleDates = new Set(visibleBars.map((bar) => bar.tradeDate));
  const visibleMarkers = markers.filter((marker) =>
    visibleDates.has(marker.tradeDate),
  );
  const visibleSellMarkers = sellMarkers.filter((marker) =>
    visibleDates.has(marker.tradeDate),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[1180px] overflow-hidden rounded-lg p-0">
        <header className="flex flex-col gap-4 border-b border-border/70 bg-background-elevated/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/[0.08] text-primary">
              <ChartLineUp size={21} weight="duotone" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">
                {instrument?.name ?? "K 线研究"}
              </DialogTitle>
              <DialogDescription className="mt-1 font-mono text-[10px]">
                {instrument?.symbol} · {instrument?.exchange} ·{" "}
                {bars.length > 0 ? (
                  <span className="text-primary">{sourceLabel(bars.at(-1)?.provider)}</span>
                ) : (
                  "加载中"
                )}
                {bars.at(-1)?.fetchedAt && (
                  <span className="text-foreground-subtle">
                    {" "}
                    · 更新 {new Date(bars.at(-1)!.fetchedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-7 sm:pr-8">
            {recommendation && (
              <Badge
                variant="outline"
                className={cn(
                  "h-7 rounded-md font-mono text-[10px]",
                  signalMeta[recommendation.signal].className,
                )}
              >
                {signalMeta[recommendation.signal].label} · {recommendation.score}
              </Badge>
            )}
            <div className="flex rounded-md border border-border bg-background p-0.5">
              {([7, 20, 30, 60, 120] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRange(value)}
                  aria-pressed={range === value}
                  className={cn(
                    "h-7 rounded px-3 font-mono text-[10px] transition-colors active:scale-[0.98]",
                    range === value
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground-muted hover:text-foreground",
                  )}
                >
                  {value}D
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="max-h-[calc(92vh-73px)] overflow-y-auto">
          {loading ? (
            <ChartSkeleton />
          ) : error ? (
            <div className="grid min-h-[520px] place-items-center p-8 text-center">
              <div>
                <Info size={28} className="mx-auto text-accent-rose" />
                <p className="mt-3 text-sm font-semibold">行情加载失败</p>
                <p className="mt-1 text-xs text-foreground-muted">{error}</p>
              </div>
            </div>
          ) : visibleBars.length > 0 ? (
            <>
              <ProfessionalMarketChart
                bars={visibleBars}
                markers={visibleMarkers}
                sellMarkers={visibleSellMarkers}
                keyPoints={keyPoints}
                instrument={instrument}
                aiDeepEnabled={keyPointSetting.aiDeep}
                height={460}
              />

              <div className="grid border-t border-border/70 xl:grid-cols-[1.05fr_0.75fr_0.75fr]">
                <section className="border-b border-border/70 px-5 py-4 xl:border-b-0 xl:border-r xl:px-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-xs font-semibold">
                      <Crosshair size={15} className="text-primary" />
                      历史买点轨道
                    </h3>
                    <span className="font-mono text-[9px] text-foreground-subtle">
                      {visibleMarkers.length} SIGNALS
                    </span>
                  </div>
                  {visibleMarkers.length > 0 ? (
                    <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
                      {visibleMarkers
                        .slice(-4)
                        .reverse()
                        .map((marker) => (
                          <div
                            key={marker.tradeDate}
                            className="bg-background-elevated px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-[10px] text-foreground-muted">
                                {marker.tradeDate}
                              </span>
                              <span className="text-[10px] font-medium text-accent-emerald">
                                {marker.label}
                              </span>
                            </div>
                            <p className="mt-1.5 text-[11px] leading-4 text-foreground-subtle">
                              {marker.detail}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="border-l-2 border-border px-3 py-2 text-xs text-foreground-muted">
                      当前窗口没有满足规则的历史买点。
                    </div>
                  )}
                </section>

                <section className="border-b border-border/70 px-5 py-4 xl:border-b-0 xl:border-r xl:px-6">
                  <h3 className="flex items-center gap-2 text-xs font-semibold">
                    <Brain size={15} weight="duotone" className="text-primary" />
                    智能研判
                  </h3>
                  {intelligence && (
                    <div className="mt-3">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <div className="font-mono text-2xl font-semibold text-primary">
                            {intelligence.confidence}
                            <span className="ml-1 text-[9px] font-normal text-foreground-subtle">/100</span>
                          </div>
                          <div className="mt-0.5 text-[9px] text-foreground-muted">
                            研究一致性 · {intelligence.regimeLabel}
                          </div>
                        </div>
                        <div className="text-right font-mono text-[8px] text-foreground-subtle">
                          <div>支撑 {intelligence.support}</div>
                          <div className="mt-1">压力 {intelligence.resistance}</div>
                        </div>
                      </div>
                      <div className="mt-3 border-l-2 border-primary bg-primary/[0.035] px-3 py-2">
                        <div className="text-[10px] font-semibold">{intelligence.actionTitle}</div>
                        <p className="mt-1 text-[9px] leading-4 text-foreground-muted">
                          {intelligence.actionSummary}
                        </p>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {intelligence.nextChecks.slice(0, 3).map((item) => (
                          <div key={item} className="flex gap-2 text-[9px] leading-4 text-foreground-muted">
                            <Crosshair size={11} className="mt-0.5 shrink-0 text-primary" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="px-5 py-4 xl:px-6">
                  <h3 className="flex items-center gap-2 text-xs font-semibold">
                    <TrendUp size={15} className="text-primary" />
                    研究结论
                  </h3>
                  {recommendation && (
                    <div className="mt-3 space-y-2">
                      {recommendation.reasons.map((reason) => (
                        <div
                          key={reason}
                          className="flex gap-2 text-[11px] leading-4 text-foreground-muted"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-emerald" />
                          {reason}
                        </div>
                      ))}
                      <div className="mt-3 flex gap-2 border-t border-border/70 pt-3 text-[10px] leading-4 text-foreground-subtle">
                        <Info size={13} className="mt-0.5 shrink-0 text-accent-amber" />
                        {intelligence?.uncertainties[0] ??
                          "买点由 MA5/MA20、近 10 日突破和回踩确认生成，仅用于历史研究。"}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <div className="grid min-h-[520px] place-items-center text-sm text-foreground-muted">
              暂无日线数据
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChartSkeleton() {
  return (
    <div className="p-5" aria-label="正在加载 K 线">
      <div className="h-9 border-b border-border bg-muted shimmer" />
      <div className="h-[460px] bg-muted/60 shimmer" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-md bg-muted shimmer" />
        <div className="h-24 rounded-md bg-muted shimmer" />
      </div>
    </div>
  );
}
