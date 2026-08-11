import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowClockwise,
  ArrowDownRight,
  ArrowUpRight,
  ArrowsOut,
  Brain,
  ChartBar,
  ChartLineUp,
  ClockCountdown,
  Crosshair,
  Database,
  Tray,
  Pulse,
  ShieldWarning,
  Target,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";
import { loadWithFallback, registry } from "@/data/provider-registry";
import type { DataSourceId } from "@/data/provider-registry";
import { summarizeDashboard } from "@/dashboard/summary";
import { buildBuyTimingMarkers } from "@/quant/buy-timing";
import { buildSignalIntelligence } from "@/intelligence/signal-intelligence";
import type { SignalIntelligence } from "@/intelligence/signal-intelligence";
import type {
  DailyBar,
  Recommendation,
  RecommendationSignal,
} from "@/quant/types";
import { useWatchlist } from "@/watchlist/use-watchlist";
import { useScanCenter } from "@/scans/use-scan-center";
import type { ScanRun } from "@/scans/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { MarketChartDialog } from "@/components/market-chart/market-chart-dialog";
import { ProfessionalMarketChart } from "@/components/market-chart/professional-market-chart";

const signalMeta: Record<
  RecommendationSignal,
  { label: string; className: string; dotClassName: string }
> = {
  buy_watch: {
    label: "买入观察",
    className:
      "border-accent-emerald/35 bg-accent-emerald/[0.07] text-accent-emerald",
    dotClassName: "bg-accent-emerald",
  },
  hold: {
    label: "继续观察",
    className:
      "border-accent-amber/35 bg-accent-amber/[0.07] text-accent-amber",
    dotClassName: "bg-accent-amber",
  },
  avoid: {
    label: "暂不交易",
    className:
      "border-accent-rose/35 bg-accent-rose/[0.07] text-accent-rose",
    dotClassName: "bg-accent-rose",
  },
};

export function HomePage() {
  const watchlist = useWatchlist();
  const scans = useScanCenter();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceId>("akshare");
  const [fellBack, setFellBack] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartBars, setChartBars] = useState<DailyBar[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [range, setRange] = useState<20 | 30>(30);

  const watchedIds = useMemo(
    () =>
      watchlist.entries
        .filter((entry) => entry.enabled)
        .map((entry) => entry.instrumentId),
    [watchlist.entries],
  );
  const watchedIdsKey = watchedIds.join("|");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadWithFallback(watchedIds, "akshare");
      setRecommendations(result.recommendations);
      setDataSource(result.source);
      setFellBack(result.fellBack);
      // A network failure that triggers the offline fallback is surfaced as a
      // non-fatal notice (the dashboard still renders with fixture data).
      if (result.fellBack && result.error) {
        setError(null);
      }
      setSelectedId((current) =>
        result.recommendations.some((item) => item.instrument.id === current)
          ? current
          : (result.recommendations[0]?.instrument.id ?? null),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const runManualScan = async () => {
    const run = await scans.runNow(watchedIds);
    if (run?.status === "completed") await refresh();
  };

  useEffect(() => {
    if (watchlist.ready) void refresh();
  }, [watchlist.ready, watchedIdsKey]);

  const summary = useMemo(
    () => summarizeDashboard(recommendations),
    [recommendations],
  );
  const selected = useMemo(
    () =>
      recommendations.find((item) => item.instrument.id === selectedId) ??
      recommendations[0],
    [recommendations, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setChartBars([]);
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    void registry
      .provider(dataSource)
      .getDailyBars(selected.instrument.id, 30)
      .then((bars) => {
        if (!cancelled) setChartBars(bars);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.instrument.id, dataSource]);

  const visibleBars = chartBars.slice(-range);
  const markers = useMemo(() => buildBuyTimingMarkers(chartBars), [chartBars]);
  const visibleDateSet = useMemo(
    () => new Set(visibleBars.map((bar) => bar.tradeDate)),
    [visibleBars],
  );
  const visibleMarkers = markers.filter((marker) =>
    visibleDateSet.has(marker.tradeDate),
  );
  const intelligence = useMemo(
    () =>
      selected && chartBars.length >= 21
        ? buildSignalIntelligence(selected, chartBars)
        : null,
    [chartBars, selected],
  );

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "h-auto min-h-full gap-4 px-4 py-4 sm:px-5 lg:px-7 lg:py-5",
      )}
    >
      <DashboardHeader
        loading={loading || scans.running}
        latestRun={scans.runs[0] ?? null}
        dataSource={dataSource}
        fellBack={fellBack}
        onRefresh={() => void runManualScan()}
      />

      {loading && recommendations.length === 0 ? (
        <DashboardSkeleton />
      ) : error || watchlist.error ? (
        <DashboardError
          message={error ?? watchlist.error ?? "未知错误"}
          onRetry={() => void refresh()}
        />
      ) : summary.total === 0 ? (
        <DashboardEmpty />
      ) : (
        <>
          <MetricStrip summary={summary} />

          {fellBack && (
            <div className="flex items-start justify-between gap-4 border-l-2 border-accent-amber bg-accent-amber/[0.05] px-3 py-2.5 sm:items-center sm:px-4">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <Warning
                  size={16}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-accent-amber sm:mt-0"
                />
                <p className="text-[11px] leading-4 text-foreground-muted sm:text-xs">
                  AKShare 数据源暂不可用，已回退到离线样例行情。显示的数据用于验证研究流程，不构成交易依据。
                </p>
              </div>
              <Badge variant="outline" className="hidden shrink-0 font-mono text-[9px] sm:inline-flex">
                FALLBACK
              </Badge>
            </div>
          )}

          {!fellBack && summary.freshness.state === "stale" && (
            <div className="flex items-start justify-between gap-4 border-l-2 border-accent-amber bg-accent-amber/[0.05] px-3 py-2.5 sm:items-center sm:px-4">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <Warning
                  size={16}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-accent-amber sm:mt-0"
                />
                <p className="text-[11px] leading-4 text-foreground-muted sm:text-xs">
                  当前使用录制行情，距今 {summary.freshness.daysOld} 天。信号用于验证研究流程，不构成交易依据。
                </p>
              </div>
              <Badge variant="outline" className="hidden shrink-0 font-mono text-[9px] sm:inline-flex">
                RECORDED
              </Badge>
            </div>
          )}

          {selected && (
            <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,0.72fr)]">
              <ChartWorkspace
                recommendation={selected}
                bars={visibleBars}
                markers={visibleMarkers}
                loading={chartLoading}
                range={range}
                onRangeChange={setRange}
                onExpand={() => setChartOpen(true)}
              />
              <RecommendationQueue
                recommendations={recommendations}
                selectedId={selected.instrument.id}
                onSelect={setSelectedId}
              />
            </section>
          )}

          {selected && (
            <ResearchInspector
              recommendation={selected}
              intelligence={intelligence}
              latestRun={scans.runs[0] ?? null}
            />
          )}
        </>
      )}

      <footer className="flex items-start gap-2 border-t border-border/70 pt-3 text-[10px] leading-4 text-foreground-subtle sm:text-xs">
        <ShieldWarning size={15} className="mt-0.5 shrink-0" />
        <span>个人研究工具 · 数据可能延迟或失真 · 投资决策需自行核验并承担风险</span>
      </footer>

      <MarketChartDialog
        instrument={selected?.instrument ?? null}
        open={chartOpen}
        onOpenChange={setChartOpen}
      />
    </div>
  );
}

function DashboardHeader({
  loading,
  latestRun,
  dataSource,
  fellBack,
  onRefresh,
}: {
  loading: boolean;
  latestRun: ScanRun | null;
  dataSource: DataSourceId;
  fellBack: boolean;
  onRefresh: () => void;
}) {
  const sourceLabel =
    dataSource === "akshare" ? "AKSHARE" : "RECORDED FIXTURE";
  return (
    <header className="flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[9px] font-semibold text-primary">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                fellBack ? "bg-accent-amber" : "bg-accent-emerald",
              )}
            />
            MARKET MONITOR
          </span>
          <span className="text-foreground-subtle">/</span>
          <span className="text-foreground-muted">DAILY RESEARCH</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">市场研究台</h1>
          <p className="text-[11px] text-foreground-muted sm:text-xs">
            排名、因子与买点轨迹同步联动
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="font-mono text-[9px] text-foreground-subtle sm:text-right">
          <div>{latestRun ? "LAST SCAN" : "ENGINE READY"}</div>
          <div className="mt-0.5 text-foreground-muted">
            {latestRun
              ? new Date(latestRun.startedAt).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : sourceLabel}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="gap-2 active:scale-[0.98]"
        >
          <ArrowClockwise
            size={16}
            className={cn(loading && "animate-spin")}
          />
          {loading ? "扫描中" : "刷新信号"}
        </Button>
      </div>
    </header>
  );
}

function MetricStrip({
  summary,
}: {
  summary: ReturnType<typeof summarizeDashboard>;
}) {
  const items = [
    {
      label: "监控标的",
      value: String(summary.total).padStart(2, "0"),
      detail: "股票与基金",
      icon: Database,
    },
    {
      label: "买入观察",
      value: String(summary.signalCounts.buyWatch).padStart(2, "0"),
      detail: `${summary.signalCounts.avoid} 个暂不交易`,
      icon: Target,
    },
    {
      label: "平均评分",
      value: String(summary.averageScore),
      detail: "100 分制",
      icon: ChartBar,
    },
    {
      label: "领先标的",
      value: summary.strongest?.instrument.symbol ?? "--",
      detail: summary.strongest
        ? `${summary.strongest.instrument.name} · ${summary.strongest.score} 分`
        : "暂无数据",
      icon: Pulse,
    },
  ];

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      className="grid grid-cols-2 border-y border-border bg-background-elevated/30 lg:grid-cols-[0.75fr_0.8fr_0.8fr_1.65fr]"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={item.label}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ type: "spring", stiffness: 130, damping: 20 }}
            className={cn(
              "min-w-0 px-3 py-3 sm:px-4",
              index % 2 !== 0 && "border-l border-border",
              index >= 2 && "border-t border-border lg:border-t-0",
              index === 2 && "lg:border-l",
              index === 3 && "lg:border-l",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-foreground-muted sm:text-[11px]">
                {item.label}
              </span>
              <Icon size={15} className="text-primary" />
            </div>
            <div className="mt-1.5 truncate font-mono text-xl font-semibold sm:text-2xl">
              {item.value}
            </div>
            <div className="mt-0.5 truncate text-[9px] text-foreground-subtle sm:text-[10px]">
              {item.detail}
            </div>
          </motion.div>
        );
      })}
    </motion.section>
  );
}

function ChartWorkspace({
  recommendation,
  bars,
  markers,
  loading,
  range,
  onRangeChange,
  onExpand,
}: {
  recommendation: Recommendation;
  bars: DailyBar[];
  markers: ReturnType<typeof buildBuyTimingMarkers>;
  loading: boolean;
  range: 20 | 30;
  onRangeChange: (range: 20 | 30) => void;
  onExpand: () => void;
}) {
  const meta = signalMeta[recommendation.signal];
  const positive = recommendation.dailyChangePct >= 0;

  return (
    <motion.div
      key={recommendation.instrument.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 115, damping: 20 }}
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/55 shadow-diffusion-sm"
    >
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/[0.08] text-primary">
            <ChartLineUp size={19} weight="duotone" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold sm:text-base">
                {recommendation.instrument.name}
              </h2>
              <Badge variant="outline" className={cn("hidden text-[9px] sm:inline-flex", meta.className)}>
                {meta.label}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-foreground-subtle sm:text-[10px]">
              <span>{recommendation.instrument.symbol}</span>
              <span>{recommendation.instrument.exchange}</span>
              <span>{recommendation.asOfDate}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
            <div className="font-mono text-base font-semibold sm:text-lg">
              {recommendation.price.toFixed(recommendation.price > 100 ? 2 : 3)}
            </div>
            <div
              className={cn(
                "font-mono text-[10px]",
                positive ? "text-accent-emerald" : "text-accent-rose",
              )}
            >
              {positive ? "+" : ""}
              {recommendation.dailyChangePct.toFixed(2)}%
            </div>
          </div>
          <div className="flex items-center rounded-md border border-border bg-background p-0.5">
            {([20, 30] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onRangeChange(value)}
                aria-pressed={range === value}
                className={cn(
                  "h-7 px-2.5 font-mono text-[9px] transition-colors active:scale-[0.97]",
                  range === value
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground-muted hover:text-foreground",
                )}
              >
                {value}D
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onExpand}
            aria-label="全屏查看 K 线"
            title="展开 K 线研究"
            className="grid h-8 w-8 place-items-center text-foreground-subtle transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
          >
            <ArrowsOut size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-[320px] bg-muted/55 shimmer sm:h-[390px]" aria-label="正在加载 K 线" />
      ) : bars.length > 0 ? (
        <ProfessionalMarketChart
          bars={bars}
          markers={markers}
          height={390}
          className="[&>div:last-child]:max-sm:!h-[320px]"
        />
      ) : (
        <div className="grid h-[320px] place-items-center text-xs text-foreground-muted sm:h-[390px]">
          暂无可用日线行情
        </div>
      )}

      <div className="grid border-t border-border lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <Crosshair size={14} className="text-primary" />
              动态买点轨迹
            </div>
            <span className="font-mono text-[9px] text-foreground-subtle">
              {markers.length} SIGNALS
            </span>
          </div>
          {markers.length > 0 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {markers
                .slice(-3)
                .reverse()
                .map((marker) => (
                  <div
                    key={marker.tradeDate}
                    className="min-w-[210px] flex-1 border-l-2 border-accent-emerald bg-accent-emerald/[0.035] px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] text-foreground-subtle">
                        {marker.tradeDate}
                      </span>
                      <span className="text-[9px] font-medium text-accent-emerald">
                        {marker.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-foreground-muted">
                      {marker.detail}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] leading-4 text-foreground-muted">
              当前窗口未出现满足趋势突破或回踩确认规则的历史节点。
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 lg:block lg:border-l lg:border-t-0">
          <div className="text-[10px] text-foreground-muted">综合评分</div>
          <div className="font-mono text-2xl font-semibold text-primary lg:mt-1">
            {recommendation.score}
            <span className="ml-1 text-[10px] font-normal text-foreground-subtle">/ 100</span>
          </div>
          <div className="hidden text-[9px] text-foreground-subtle lg:mt-1 lg:block">
            趋势、动量、风险加权
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RecommendationQueue({
  recommendations,
  selectedId,
  onSelect,
}: {
  recommendations: Recommendation[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/55">
      <div className="flex items-end justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
        <div>
          <h2 className="text-sm font-semibold">信号排名</h2>
          <p className="mt-0.5 text-[10px] text-foreground-muted">选择标的联动 K 线与因子</p>
        </div>
        <span className="font-mono text-[9px] text-foreground-subtle">
          {recommendations.length} ASSETS
        </span>
      </div>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.055 } } }}
        className="divide-y divide-border/70"
      >
        {recommendations.map((recommendation, index) => (
          <RecommendationRow
            key={recommendation.instrument.id}
            index={index}
            recommendation={recommendation}
            selected={recommendation.instrument.id === selectedId}
            onSelect={() => onSelect(recommendation.instrument.id)}
          />
        ))}
      </motion.div>
    </aside>
  );
}

function RecommendationRow({
  index,
  recommendation,
  selected,
  onSelect,
}: {
  index: number;
  recommendation: Recommendation;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = signalMeta[recommendation.signal];
  const positive = recommendation.dailyChangePct >= 0;

  return (
    <motion.button
      type="button"
      layout
      variants={{
        hidden: { opacity: 0, x: 8 },
        visible: { opacity: 1, x: 0 },
      }}
      transition={{ type: "spring", stiffness: 130, damping: 20 }}
      onClick={onSelect}
      className={cn(
        "group relative grid w-full grid-cols-[24px_minmax(0,1fr)_54px] items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-[0.99] sm:px-4",
        selected && "bg-primary/[0.075]",
      )}
    >
      {selected && (
        <motion.span
          layoutId="recommendation-signal"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
        />
      )}
      <span className="font-mono text-[10px] text-foreground-subtle">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold sm:text-sm">
            {recommendation.instrument.name}
          </span>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dotClassName)} />
        </div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-foreground-subtle">
          <span>{recommendation.instrument.symbol}</span>
          <span>{recommendation.instrument.kind === "fund" ? "基金" : "A 股"}</span>
          <span
            className={cn(
              "inline-flex items-center",
              positive ? "text-accent-emerald" : "text-accent-rose",
            )}
          >
            {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {Math.abs(recommendation.dailyChangePct).toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-lg font-semibold text-primary">
          {recommendation.score}
        </div>
        <div className="mt-0.5 truncate text-[8px] text-foreground-subtle">
          {meta.label}
        </div>
      </div>
    </motion.button>
  );
}

function ResearchInspector({
  recommendation,
  intelligence,
  latestRun,
}: {
  recommendation: Recommendation;
  intelligence: SignalIntelligence | null;
  latestRun: ScanRun | null;
}) {
  return (
    <section className="grid overflow-hidden rounded-lg border border-border bg-background-elevated/40 md:grid-cols-2 xl:grid-cols-[1fr_0.92fr_0.92fr_0.78fr]">
      <div className="border-b border-border px-4 py-4 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold">
            <TrendUp size={15} className="text-primary" />
            因子结构
          </h2>
          <span className="font-mono text-[9px] text-foreground-subtle">WEIGHTED</span>
        </div>
        <div className="mt-3 space-y-3">
          {recommendation.factors.map((factor) => (
            <div key={factor.key}>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-foreground-muted">{factor.label}</span>
                <span className="font-mono font-semibold">{factor.score}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  key={`${recommendation.instrument.id}-${factor.key}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: factor.score / 100 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  className="h-full origin-left rounded-full bg-primary"
                />
              </div>
              <div className="mt-1 truncate font-mono text-[8px] text-foreground-subtle">
                {factor.detail} · 权重 {Math.round(factor.weight * 100)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      <IntelligencePanel intelligence={intelligence} />
      <ReasonColumn
        title="结论依据"
        items={recommendation.reasons}
        tone="positive"
      />
      <div className="border-t border-border px-4 py-4 lg:border-l lg:border-t-0">
        <h2 className="flex items-center gap-2 text-xs font-semibold">
          <ClockCountdown size={15} className="text-primary" />
          研究快照
        </h2>
        <dl className="mt-3 space-y-2 text-[10px]">
          <SnapshotRow label="行情日期" value={recommendation.asOfDate} />
          <SnapshotRow label="数据来源" value={recommendation.provider} />
          <SnapshotRow
            label="最近扫描"
            value={
              latestRun
                ? latestRun.status === "completed"
                  ? "已完成"
                  : "待处理"
                : "尚未运行"
            }
          />
        </dl>
        <div className="mt-3 border-t border-border/70 pt-3">
          <div className="text-[9px] font-semibold text-accent-amber">风险提示</div>
          <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-foreground-muted">
            {recommendation.risks.join("；")}
          </p>
        </div>
      </div>
    </section>
  );
}

function IntelligencePanel({
  intelligence,
}: {
  intelligence: SignalIntelligence | null;
}) {
  if (!intelligence) {
    return (
      <div className="border-b border-border px-4 py-4 md:border-l xl:border-l-0 xl:border-r">
        <div className="h-28 rounded-md bg-muted/55 shimmer" aria-label="正在生成智能研判" />
      </div>
    );
  }

  const confidenceLabel = {
    high: "高一致性",
    medium: "中等一致性",
    low: "低一致性",
  }[intelligence.confidenceLevel];

  return (
    <div className="border-b border-border px-4 py-4 md:border-l xl:border-l-0 xl:border-r">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold">
          <Brain size={15} weight="duotone" className="text-primary" />
          智能研判
        </h2>
        <Badge variant="outline" className="text-[8px] text-primary">
          {intelligence.regimeLabel}
        </Badge>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-2xl font-semibold text-primary">
            {intelligence.confidence}
            <span className="ml-1 text-[9px] font-normal text-foreground-subtle">/100</span>
          </div>
          <div className="mt-0.5 text-[9px] text-foreground-muted">{confidenceLabel}</div>
        </div>
        <div className="text-right font-mono text-[8px] text-foreground-subtle">
          <div>因子 {intelligence.factorConsensus}</div>
          <div className="mt-1">稳定 {intelligence.signalStability}</div>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          key={`${intelligence.asOfDate}-${intelligence.confidence}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: intelligence.confidence / 100 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="h-full origin-left rounded-full bg-primary"
        />
      </div>
      <div className="mt-3 text-[10px] font-semibold">{intelligence.actionTitle}</div>
      <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-foreground-muted">
        {intelligence.actionSummary}
      </p>
      <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2 font-mono text-[8px] text-foreground-subtle">
        <span>支撑 {intelligence.support}</span>
        <span>压力 {intelligence.resistance}</span>
      </div>
    </div>
  );
}

function ReasonColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "warning";
}) {
  return (
    <div className="border-b border-border px-4 py-4 lg:border-b-0">
      <h2 className="text-xs font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[10px] leading-4 text-foreground-muted">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                tone === "positive" ? "bg-accent-emerald" : "bg-accent-amber",
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-foreground-subtle">{label}</dt>
      <dd className="truncate font-mono text-foreground-muted">{value}</dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="正在加载研究工作台" className="space-y-4">
      <div className="grid grid-cols-2 border-y border-border lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 border-l border-border p-3 first:border-l-0 sm:h-24 sm:p-4">
            <div className="h-2.5 w-16 rounded bg-muted shimmer" />
            <div className="mt-3 h-6 w-12 rounded bg-muted shimmer" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,0.72fr)]">
        <div className="h-[480px] rounded-lg border border-border bg-muted/40 shimmer" />
        <div className="h-[480px] rounded-lg border border-border bg-muted/40 shimmer" />
      </div>
    </div>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center border border-accent-rose/30 bg-accent-rose/[0.04] p-6 text-center">
      <div className="max-w-md">
        <Warning size={28} weight="duotone" className="mx-auto text-accent-rose" />
        <h2 className="mt-3 text-base font-semibold">扫描失败</h2>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">{message}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          重新扫描
        </Button>
      </div>
    </div>
  );
}

function DashboardEmpty() {
  return (
    <div className="grid min-h-72 place-items-center border border-border p-6 text-center">
      <div className="max-w-md">
        <Tray size={28} className="mx-auto text-foreground-subtle" />
        <h2 className="mt-3 text-base font-semibold">观察列表还是空的</h2>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          添加股票或基金后，QuantSift 会在这里联动行情、评分、风险和扫描活动。
        </p>
      </div>
    </div>
  );
}
