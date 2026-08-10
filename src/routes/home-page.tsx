import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Database,
  Inbox,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import { loadRecommendations } from "@/data/recommendation-service";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { summarizeDashboard } from "@/dashboard/summary";
import type { Recommendation, RecommendationSignal } from "@/quant/types";
import { useWatchlist } from "@/watchlist/use-watchlist";
import { useScanCenter } from "@/scans/use-scan-center";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";

const signalMeta: Record<
  RecommendationSignal,
  { label: string; className: string }
> = {
  buy_watch: {
    label: "买入观察",
    className:
      "border-accent-emerald/35 bg-accent-emerald/10 text-accent-emerald",
  },
  hold: {
    label: "继续观察",
    className: "border-accent-amber/35 bg-accent-amber/10 text-accent-amber",
  },
  avoid: {
    label: "暂不交易",
    className: "border-accent-rose/35 bg-accent-rose/10 text-accent-rose",
  },
};

export function HomePage() {
  const watchlist = useWatchlist();
  const scans = useScanCenter();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      const next = await loadRecommendations(
        recordedMarketDataProvider,
        watchedIds,
      );
      setRecommendations(next);
      setSelectedId((current) => current ?? next[0]?.instrument.id ?? null);
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

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "relative h-auto min-h-full gap-5 px-5 py-5 lg:px-7",
      )}
    >
      <DashboardHeader
        loading={loading || scans.running}
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

          {summary.freshness.state === "stale" && (
            <div className="flex items-center justify-between gap-4 border-l-2 border-accent-amber bg-accent-amber/[0.06] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-accent-amber" />
                <p className="truncate text-xs text-foreground-muted">
                  当前为录制样例，行情日期距今 {summary.freshness.daysOld} 天；接入实时 provider 前请勿据此交易。
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                DEMO DATA
              </Badge>
            </div>
          )}

          <section className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <RecommendationQueue
              recommendations={recommendations}
              selectedId={selected?.instrument.id ?? null}
              onSelect={setSelectedId}
            />
            {selected && <RecommendationDetail recommendation={selected} />}
          </section>

          <RecentActivity summary={summary} latestRun={scans.runs[0] ?? null} />
        </>
      )}

      <footer className="flex items-start gap-2 border-t border-border/70 pt-4 text-xs leading-5 text-foreground-subtle">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>个人研究工具 · 数据可能延迟或失真 · 投资决策需自行核验并承担风险</span>
      </footer>
    </div>
  );
}

function DashboardHeader({
  loading,
  onRefresh,
}: {
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-primary">
          <span>Dashboard</span>
          <span className="text-foreground-subtle">/</span>
          <span className="text-foreground-muted">日频研究</span>
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold text-foreground">
          研究工作台
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-xs text-foreground-muted">数据模式</p>
          <p className="mt-0.5 font-mono text-[11px] text-foreground-subtle">
            RECORDED FIXTURE
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="gap-2 active:translate-y-px"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "扫描中" : "立即扫描"}
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
      label: "观察标的",
      value: String(summary.total),
      detail: "股票与基金",
      icon: Database,
    },
    {
      label: "买入观察",
      value: String(summary.signalCounts.buyWatch),
      detail: `${summary.signalCounts.avoid} 个暂不交易`,
      icon: Target,
    },
    {
      label: "平均评分",
      value: String(summary.averageScore),
      detail: "满分 100",
      icon: BarChart3,
    },
    {
      label: "最强信号",
      value: summary.strongest?.instrument.symbol ?? "--",
      detail: summary.strongest
        ? `${summary.strongest.instrument.name} · ${summary.strongest.score} 分`
        : "暂无数据",
      icon: Activity,
    },
  ];

  return (
    <section className="grid grid-cols-2 border-y border-border bg-background-elevated/35 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              "min-w-0 px-4 py-4",
              index % 2 !== 0 && "border-l border-border",
              index >= 2 && "border-t border-border lg:border-t-0",
              index === 2 && "lg:border-l",
              index === 3 && "lg:border-l",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground-muted">{item.label}</span>
              <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
            </div>
            <div className="mt-2 truncate font-mono text-2xl font-semibold text-foreground">
              {item.value}
            </div>
            <div className="mt-1 truncate text-[11px] text-foreground-subtle">
              {item.detail}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function RecommendationQueue({
  recommendations,
  selectedId,
  onSelect,
}: {
  recommendations: Recommendation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/55">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">推荐工作队列</h2>
          <p className="mt-1 text-[11px] text-foreground-muted">
            按综合分数排序，选择标的查看依据
          </p>
        </div>
        <span className="font-mono text-xs text-foreground-subtle">
          {recommendations.length} ITEMS
        </span>
      </div>
      <div className="divide-y divide-border/70">
        {recommendations.map((recommendation) => (
          <RecommendationRow
            key={recommendation.instrument.id}
            recommendation={recommendation}
            selected={recommendation.instrument.id === selectedId}
            onSelect={() => onSelect(recommendation.instrument.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationRow({
  recommendation,
  selected,
  onSelect,
}: {
  recommendation: Recommendation;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = signalMeta[recommendation.signal];
  const positive = recommendation.dailyChangePct >= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_92px_82px] items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:translate-y-px",
        selected && "bg-primary/[0.07]",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {recommendation.instrument.name}
          </span>
          <span className="font-mono text-[10px] text-foreground-subtle">
            {recommendation.instrument.symbol}
          </span>
        </div>
        <div className="mt-1 text-xs text-foreground-muted">
          {recommendation.instrument.kind === "fund" ? "公募基金" : "A 股"}
          <span className="px-1.5 text-foreground-subtle">·</span>
          {recommendation.asOfDate}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm">
          {recommendation.price.toFixed(recommendation.price > 100 ? 2 : 3)}
        </div>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-0.5 font-mono text-[11px]",
            positive ? "text-accent-emerald" : "text-accent-rose",
          )}
        >
          {positive ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {Math.abs(recommendation.dailyChangePct).toFixed(2)}%
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-lg font-semibold text-primary">
          {recommendation.score}
        </div>
        <Badge
          variant="outline"
          className={cn("mt-1 text-[10px]", meta.className)}
        >
          {meta.label}
        </Badge>
      </div>
    </button>
  );
}

function RecommendationDetail({ recommendation }: { recommendation: Recommendation }) {
  const meta = signalMeta[recommendation.signal];

  return (
    <aside className="rounded-lg border border-border bg-background-elevated/55">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] text-foreground-subtle">
              {recommendation.instrument.symbol} · {recommendation.instrument.exchange}
            </div>
            <h2 className="mt-1 text-lg font-semibold">
              {recommendation.instrument.name}
            </h2>
          </div>
          <Badge variant="outline" className={cn("shrink-0", meta.className)}>
            {meta.label}
          </Badge>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xs text-foreground-muted">综合评分</div>
            <div className="mt-1 font-mono text-3xl font-semibold text-primary">
              {recommendation.score}
              <span className="ml-1 text-xs font-normal text-foreground-subtle">
                /100
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-base">
              ¥{recommendation.price.toFixed(recommendation.price > 100 ? 2 : 3)}
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-xs",
                recommendation.dailyChangePct >= 0
                  ? "text-accent-emerald"
                  : "text-accent-rose",
              )}
            >
              {recommendation.dailyChangePct >= 0 ? "+" : ""}
              {recommendation.dailyChangePct.toFixed(2)}% 今日
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div>
          <h3 className="text-[11px] font-semibold uppercase text-foreground-subtle">
            因子拆解
          </h3>
          <div className="mt-2 divide-y divide-border/70">
            {recommendation.factors.map((factor) => (
              <div
                key={factor.key}
                className="grid grid-cols-[minmax(0,1fr)_44px] gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium">{factor.label}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-foreground-subtle">
                    {factor.detail} · 权重 {Math.round(factor.weight * 100)}%
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-semibold">
                  {factor.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        <ReasonList title="结论依据" items={recommendation.reasons} tone="good" />
        <ReasonList title="风险提示" items={recommendation.risks} tone="warn" />
      </div>

      <div className="border-t border-border px-4 py-3 font-mono text-[10px] text-foreground-subtle">
        {recommendation.provider} · 截止 {recommendation.asOfDate}
      </div>
    </aside>
  );
}

function ReasonList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "warn";
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase text-foreground-subtle">
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-xs leading-5 text-foreground-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              className={cn(
                "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                tone === "good" ? "bg-accent-emerald" : "bg-accent-amber",
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentActivity({
  summary,
  latestRun,
}: {
  summary: ReturnType<typeof summarizeDashboard>;
  latestRun: import("@/scans/types").ScanRun | null;
}) {
  const events = [
    {
      icon: Activity,
      title: latestRun ? "最近一次扫描" : "观察池已计算",
      detail: latestRun
        ? `${latestRun.instrumentCount} 个标的 · ${latestRun.buyWatchCount} 个买入观察`
        : `${summary.total} 个标的已计算，平均评分 ${summary.averageScore}`,
      time: latestRun
        ? new Date(latestRun.startedAt).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "本次",
    },
    {
      icon: Target,
      title: "发现买入观察信号",
      detail: `${summary.signalCounts.buyWatch} 个标的进入人工研究队列`,
      time: "刚刚",
    },
    {
      icon: CalendarClock,
      title: "自动扫描尚未配置",
      detail: "完成观察列表后可设置工作日收盘扫描",
      time: "待设置",
    },
  ];

  return (
    <section className="border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">近期活动</h2>
        <span className="text-[11px] text-foreground-subtle">本地记录</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {events.map((event) => {
          const Icon = event.icon;
          return (
            <div
              key={event.title}
              className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 border border-border/70 px-3 py-3"
            >
              <div className="grid h-7 w-7 place-items-center bg-muted text-foreground-muted">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{event.title}</div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-foreground-subtle">
                  {event.detail}
                </div>
              </div>
              <span className="text-[10px] text-foreground-subtle">{event.time}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="正在加载研究工作台" className="space-y-4">
      <div className="grid grid-cols-2 border-y border-border lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 border-l border-border p-4 first:border-l-0">
            <div className="h-3 w-20 rounded bg-muted shimmer" />
            <div className="mt-4 h-6 w-14 rounded bg-muted shimmer" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="h-96 rounded-lg border border-border bg-background-elevated/40 shimmer" />
        <div className="h-96 rounded-lg border border-border bg-background-elevated/40 shimmer" />
      </div>
    </div>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center border border-accent-rose/30 bg-accent-rose/[0.04] p-6 text-center">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto h-7 w-7 text-accent-rose" />
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
        <Inbox className="mx-auto h-7 w-7 text-foreground-subtle" />
        <h2 className="mt-3 text-base font-semibold">观察列表还是空的</h2>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          添加股票或基金后，QuantSift 会在这里汇总评分、风险和扫描活动。
        </p>
      </div>
    </div>
  );
}
