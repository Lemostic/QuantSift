import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Calculator,
  ChartLine,
  Crosshair,
  ListChecks,
  Play,
  TrendDown,
  Wallet,
  Warning,
} from "@phosphor-icons/react";
import { configuredProvider } from "@/data/provider-registry";
import { runBacktest } from "@/backtest/engine";
import {
  DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig,
  type BacktestExitReason,
  type BacktestPoint,
  type BacktestResult,
} from "@/backtest/types";
import type { Instrument } from "@/quant/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";

const EXIT_REASON_LABEL: Record<BacktestExitReason, string> = {
  signal: "信号退出",
  stop_loss: "止损",
  take_profit: "止盈",
  time_stop: "时间止损",
  data_end: "数据结束",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function BacktestPage() {
  const [catalog, setCatalog] = useState<Instrument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [initialCapital, setInitialCapital] = useState(
    DEFAULT_BACKTEST_CONFIG.initialCapital,
  );
  const [stopLossPct, setStopLossPct] = useState(
    DEFAULT_BACKTEST_CONFIG.stopLossPct,
  );
  const [takeProfitPct, setTakeProfitPct] = useState(
    DEFAULT_BACKTEST_CONFIG.takeProfitPct,
  );
  const [maxHoldingDays, setMaxHoldingDays] = useState(
    DEFAULT_BACKTEST_CONFIG.maxHoldingDays,
  );
  const [slippageBps, setSlippageBps] = useState(
    DEFAULT_BACKTEST_CONFIG.slippageBps,
  );
  const [exitOnAvoid, setExitOnAvoid] = useState(
    DEFAULT_BACKTEST_CONFIG.exitOnAvoid,
  );
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void configuredProvider()
      .listInstruments()
      .then((instruments) => {
        if (cancelled) return;
        setCatalog(instruments);
        setSelectedId((current) =>
          instruments.some((item) => item.id === current)
            ? current
            : (instruments[0]?.id ?? ""),
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedInstrument = useMemo(
    () => catalog.find((item) => item.id === selectedId) ?? null,
    [catalog, selectedId],
  );

  const run = async () => {
    if (!selectedInstrument) {
      setError("请先选择一个回测标的");
      return;
    }
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      initialCapital,
      stopLossPct,
      takeProfitPct,
      maxHoldingDays,
      slippageBps,
      exitOnAvoid,
    };
    setLoading(true);
    setError(null);
    try {
      const bars = await configuredProvider().getDailyBars(
        selectedInstrument.id,
        250,
      );
      setResult(runBacktest(selectedInstrument, bars, config));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const metrics = result?.metrics ?? null;

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "h-auto min-h-full gap-4 px-4 py-4 sm:px-5 lg:px-7 lg:py-5",
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[9px] font-semibold text-primary">
            RESEARCH / BACKTEST ENGINE
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">回测研究</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              用历史日线验证研究信号的退出与成本边界
            </p>
          </div>
        </div>
        <Button
          onClick={() => void run()}
          disabled={loading || !selectedInstrument}
          className="gap-2 active:scale-[0.98]"
        >
          <Play size={15} weight="fill" />
          {loading ? "回测中" : "运行回测"}
        </Button>
      </header>

      {error && (
        <div className="flex items-center gap-2 border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          <Warning size={16} weight="fill" />
          {error}
        </div>
      )}

      {metrics ? (
        <section className="grid grid-cols-2 border-y border-border bg-background-elevated/30 lg:grid-cols-[0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr]">
          <BacktestMetric
            icon={ArrowUpRight}
            label="累计收益"
            value={formatPct(metrics.totalReturnPct)}
            tone={metrics.totalReturnPct >= 0 ? "positive" : "negative"}
          />
          <BacktestMetric
            icon={ChartLine}
            label="年化收益"
            value={formatPct(metrics.annualizedReturnPct)}
            tone={metrics.annualizedReturnPct >= 0 ? "positive" : "negative"}
            bordered
          />
          <BacktestMetric
            icon={TrendDown}
            label="最大回撤"
            value={`-${metrics.maxDrawdownPct.toFixed(2)}%`}
            tone="warning"
            bordered
            topOnMobile
          />
          <BacktestMetric
            icon={Crosshair}
            label="胜率"
            value={`${metrics.winRate.toFixed(1)}%`}
            detail={`${metrics.winningTrades} 胜 / ${metrics.losingTrades} 负`}
            bordered
            topOnMobile
          />
          <BacktestMetric
            icon={ListChecks}
            label="交易次数"
            value={String(metrics.tradeCount)}
            bordered
            topOnMobile
          />
          <BacktestMetric
            icon={Calculator}
            label="盈亏比"
            value={
              metrics.profitFactor === null
                ? "--"
                : Number.isFinite(metrics.profitFactor)
                  ? metrics.profitFactor.toFixed(2)
                  : "∞"
            }
            detail={`期末 ${formatMoney(metrics.finalEquity)}`}
            bordered
            topOnMobile
          />
        </section>
      ) : (
        <section className="grid grid-cols-2 border-y border-border bg-background-elevated/30 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-20 border-l border-border p-3 first:border-l-0 sm:h-24 sm:p-4"
            >
              <div className="h-2 w-14 rounded bg-muted shimmer" />
              <div className="mt-3 h-5 w-16 rounded bg-muted shimmer" />
            </div>
          ))}
        </section>
      )}

      <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,0.62fr)_minmax(0,1.38fr)]">
        <div className="self-start overflow-hidden rounded-lg border border-border bg-background-elevated/50 shadow-diffusion-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">回测参数</h2>
              <p className="mt-0.5 text-[10px] text-foreground-muted">
                信号沿用研究引擎的因子判定
              </p>
            </div>
            <Calculator size={17} weight="duotone" className="text-primary" />
          </div>

          <div className="space-y-3 px-4 py-4">
            <label className="block">
              <span className="text-[10px] font-medium">回测标的</span>
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-1.5 h-9 w-full border border-input bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {catalog.length === 0 && <option value="">正在加载标的</option>}
                {catalog.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.name} · {instrument.symbol}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="初始资金"
                value={initialCapital}
                min={1_000}
                step="1000"
                onChange={setInitialCapital}
              />
              <NumberField
                label="滑点 (bps)"
                value={slippageBps}
                min={0}
                max={100}
                step="1"
                onChange={setSlippageBps}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="止损复核线 %"
                value={stopLossPct}
                min={0.1}
                max={100}
                step="0.5"
                onChange={setStopLossPct}
              />
              <NumberField
                label="止盈复核线 %"
                value={takeProfitPct}
                min={0.1}
                max={500}
                step="0.5"
                onChange={setTakeProfitPct}
              />
            </div>

            <NumberField
              label="最长持有 (交易日)"
              value={maxHoldingDays}
              min={1}
              max={500}
              step="5"
              onChange={setMaxHoldingDays}
            />

            <label className="flex items-center justify-between gap-4 border-t border-border/70 pt-3">
              <span>
                <span className="block text-[10px] font-medium">信号转弱退出</span>
                <span className="mt-0.5 block text-[9px] text-foreground-subtle">
                  评分跌破观察线后次日开盘退出
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={exitOnAvoid}
                onClick={() => setExitOnAvoid((value) => !value)}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full border transition-colors active:scale-[0.96]",
                  exitOnAvoid
                    ? "border-primary/40 bg-primary/20"
                    : "border-border-strong bg-muted",
                )}
              >
                <motion.span
                  animate={{ x: exitOnAvoid ? 16 : 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className={cn(
                    "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full",
                    exitOnAvoid ? "bg-primary" : "bg-foreground-subtle",
                  )}
                />
              </button>
            </label>

            <div className="rounded-md bg-muted/40 px-3 py-2.5 font-mono text-[9px] leading-4 text-foreground-subtle">
              佣金 0.03%（最低 5 元）· 股票卖出印花税 0.05% · 数据长度不足时按现有窗口回测
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/50">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">权益曲线</h2>
                <p className="mt-0.5 text-[10px] text-foreground-muted">
                  {result
                    ? `${result.bars.length} 根日线 · ${result.points.length} 个结算日`
                    : "等待回测结果"}
                </p>
              </div>
              {result && (
                <Badge variant="outline" className="font-mono text-[9px]">
                  {result.instrument.symbol}
                </Badge>
              )}
            </div>
            {result && result.points.length >= 2 ? (
              <EquityChart points={result.points} />
            ) : (
              <div className="grid min-h-64 place-items-center p-6 text-center">
                <div>
                  <ChartLine
                    size={26}
                    weight="duotone"
                    className="mx-auto text-foreground-subtle"
                  />
                  <p className="mt-3 text-xs text-foreground-muted">
                    {loading
                      ? "正在加载历史日线"
                      : "运行回测后展示每日权益与回撤"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/50">
            <div className="flex items-end justify-between gap-4 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">交易明细</h2>
                <p className="mt-0.5 text-[10px] text-foreground-muted">
                  每次买入与退出对应的日期、价格和原因
                </p>
              </div>
              <span className="font-mono text-[9px] text-foreground-subtle">
                {result?.trades.length ?? 0} TRADES
              </span>
            </div>
            {result && result.trades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/35 font-mono text-[8px] text-foreground-subtle">
                      <th className="px-4 py-2">#</th>
                      <th className="px-2 py-2">买入日期</th>
                      <th className="px-2 py-2 text-right">买入价</th>
                      <th className="px-2 py-2">退出日期</th>
                      <th className="px-2 py-2 text-right">退出价</th>
                      <th className="px-2 py-2 text-right">持有</th>
                      <th className="px-2 py-2 text-right">净收益</th>
                      <th className="px-2 py-2 text-right">收益率</th>
                      <th className="px-4 py-2">退出原因</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {result.trades.map((trade, index) => {
                      const positive = trade.netProfit >= 0;
                      return (
                        <tr key={`${trade.entryDate}-${index}`}>
                          <td className="px-4 py-2.5 font-mono text-[9px] text-foreground-subtle">
                            {String(index + 1).padStart(2, "0")}
                          </td>
                          <td className="px-2 py-2.5 font-mono text-[10px]">
                            {trade.entryDate}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono text-[10px]">
                            {trade.entryPrice.toFixed(3)}
                          </td>
                          <td className="px-2 py-2.5 font-mono text-[10px]">
                            {trade.exitDate}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono text-[10px]">
                            {trade.exitPrice.toFixed(3)}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono text-[10px]">
                            {trade.holdingDays} 日
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2.5 text-right font-mono text-[10px]",
                              positive ? "text-accent-emerald" : "text-accent-rose",
                            )}
                          >
                            {positive ? "+" : ""}
                            {formatMoney(trade.netProfit)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2.5 text-right font-mono text-[10px]",
                              positive ? "text-accent-emerald" : "text-accent-rose",
                            )}
                          >
                            {formatPct(trade.returnPct)}
                          </td>
                          <td className="px-4 py-2.5 text-[10px] text-foreground-muted">
                            {EXIT_REASON_LABEL[trade.exitReason]}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid min-h-44 place-items-center p-6 text-center">
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  {result ? (
                    <>
                      <Warning size={15} className="text-accent-amber" />
                      当前参数下没有产生完整交易
                    </>
                  ) : (
                    "暂无交易记录"
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="flex items-start gap-2 border-t border-border/70 pt-3 text-[10px] leading-4 text-foreground-subtle sm:text-xs">
        <Wallet size={15} className="mt-0.5 shrink-0" />
        <span>回测仅用于研究信号的一致性验证，包含估算成本，不代表未来收益或交易建议。</span>
      </footer>
    </div>
  );
}

function BacktestMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  bordered,
  topOnMobile,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
  bordered?: boolean;
  topOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-3 py-3 sm:px-4",
        bordered && "border-l border-border",
        topOnMobile && "border-t border-border lg:border-t-0",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[9px] text-foreground-muted sm:text-[10px]">
        <span>{label}</span>
        <Icon size={14} className="text-primary" />
      </div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-base font-semibold sm:text-xl",
          tone === "positive" && "text-accent-emerald",
          tone === "negative" && "text-accent-rose",
          tone === "warning" && "text-accent-amber",
        )}
      >
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 truncate text-[8px] text-foreground-subtle sm:text-[9px]">
          {detail}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="text-[10px] font-medium">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 h-9 w-full border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function EquityChart({ points }: { points: BacktestPoint[] }) {
  const width = 720;
  const height = 250;
  const padX = 10;
  const padTop = 14;
  const padBottom = 22;

  if (points.length < 2) return null;

  const equity = points.map((point) => point.equity);
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const range = max - min || 1;
  const xAt = (index: number) =>
    padX + (index / (points.length - 1)) * (width - padX * 2);
  const yAt = (value: number) =>
    height -
    padBottom -
    ((value - min) / range) * (height - padTop - padBottom);
  const line = points
    .map(
      (point, index) =>
        `${xAt(index).toFixed(2)},${yAt(point.equity).toFixed(2)}`,
    )
    .join(" ");
  const area = `${padX},${height - padBottom} ${line} ${width - padX},${height - padBottom}`;
  const firstDate = points[0].tradeDate;
  const lastDate = points.at(-1)!.tradeDate;
  const initialEquity = points[0].equity;

  return (
    <div className="px-3 pb-3 pt-4 sm:px-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="回测每日权益曲线"
        className="h-auto w-full"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padX}
            x2={width - padX}
            y1={yAt(min + range * ratio)}
            y2={yAt(min + range * ratio)}
            strokeWidth="1"
            strokeDasharray="3 5"
            className="stroke-border"
          />
        ))}
        <polygon
          points={area}
          fill="color-mix(in oklch, var(--color-primary) 16%, transparent)"
        />
        <polyline
          points={line}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-primary"
        />
        <text
          x={padX}
          y={yAt(min + range) - 6}
          className="fill-foreground-subtle font-mono"
          fontSize="10"
        >
          {max.toFixed(0)}
        </text>
        <text
          x={padX}
          y={yAt(min) + 14}
          className="fill-foreground-subtle font-mono"
          fontSize="10"
        >
          {min.toFixed(0)}
        </text>
      </svg>
      <div className="flex items-center justify-between font-mono text-[9px] text-foreground-subtle">
        <span>{firstDate}</span>
        <span>初始 {formatMoney(initialEquity)}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}
