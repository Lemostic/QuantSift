import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Calculator,
  ChartLineUp,
  CurrencyCny,
  FloppyDisk,
  NotePencil,
  Plus,
  ShieldWarning,
  Trash,
  Warning,
  Wallet,
} from "@phosphor-icons/react";
import { configuredProvider } from "@/data/provider-registry";
import { loadRecommendations } from "@/data/recommendation-service";
import type { Instrument, Recommendation } from "@/quant/types";
import { usePortfolio } from "@/portfolio/use-portfolio";
import {
  buildPositionSnapshot,
  summarizePortfolio,
} from "@/portfolio/risk";
import type {
  PortfolioPositionDraft,
  PositionRiskSignal,
  PositionSnapshot,
} from "@/portfolio/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketChartDialog } from "@/components/market-chart/market-chart-dialog";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";

const riskMeta: Record<
  PositionRiskSignal,
  { label: string; className: string }
> = {
  hold: {
    label: "边界内",
    className: "border-accent-emerald/35 text-accent-emerald",
  },
  take_profit_review: {
    label: "止盈复核",
    className: "border-accent-amber/35 text-accent-amber",
  },
  stop_loss_review: {
    label: "止损复核",
    className: "border-accent-rose/35 text-accent-rose",
  },
  trend_exit_review: {
    label: "趋势退出复核",
    className: "border-accent-rose/35 text-accent-rose",
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(instrumentId = ""): PortfolioPositionDraft {
  return {
    instrumentId,
    quantity: 0,
    averageCost: 0,
    openedAt: today(),
    stopLossPct: 8,
    takeProfitPct: 20,
    note: "",
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

export function PortfolioPage() {
  const portfolio = usePortfolio();
  const [catalog, setCatalog] = useState<Instrument[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [chartInstrument, setChartInstrument] = useState<Instrument | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setMarketLoading(true);
    const provider = configuredProvider();
    Promise.all([
      provider.listInstruments(),
      loadRecommendations(provider),
    ])
      .then(([instruments, next]) => {
        if (cancelled) return;
        setCatalog(instruments);
        setRecommendations(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setActionError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setMarketLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recommendationsById = useMemo(
    () =>
      new Map(
        recommendations.map((item) => [item.instrument.id, item]),
      ),
    [recommendations],
  );
  const instrumentsById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog],
  );
  const snapshots = useMemo(
    () =>
      portfolio.positions.flatMap((position) => {
        const recommendation = recommendationsById.get(position.instrumentId);
        return recommendation
          ? [buildPositionSnapshot(position, recommendation)]
          : [];
      }),
    [portfolio.positions, recommendationsById],
  );
  const snapshotById = useMemo(
    () => new Map(snapshots.map((item) => [item.position.instrumentId, item])),
    [snapshots],
  );
  const summary = useMemo(() => summarizePortfolio(snapshots), [snapshots]);
  const selectedPosition = portfolio.positions.find(
    (item) => item.instrumentId === selectedId,
  );
  const existingIds = useMemo(
    () => new Set(portfolio.positions.map((item) => item.instrumentId)),
    [portfolio.positions],
  );
  const availableInstruments = catalog.filter((item) => !existingIds.has(item.id));

  useEffect(() => {
    if (creating) return;
    if (!selectedId && portfolio.positions[0]) {
      setSelectedId(portfolio.positions[0].instrumentId);
    } else if (selectedId && !existingIds.has(selectedId)) {
      setSelectedId(portfolio.positions[0]?.instrumentId ?? null);
    }
  }, [creating, existingIds, portfolio.positions, selectedId]);

  const savePosition = async (draft: PortfolioPositionDraft) => {
    try {
      const saved = await portfolio.upsert(draft);
      setSelectedId(saved.instrumentId);
      setCreating(false);
      setActionError(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const removePosition = async (instrumentId: string) => {
    try {
      await portfolio.remove(instrumentId);
      setActionError(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const beginCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setActionError(null);
  };

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
            PORTFOLIO / RISK REVIEW
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">持仓研究</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              记录成本并将退出风险与每日研究信号联动
            </p>
          </div>
        </div>
        <Button
          onClick={beginCreate}
          disabled={availableInstruments.length === 0}
          className="gap-2 active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" />
          添加持仓
        </Button>
      </header>

      {(portfolio.error || actionError) && (
        <div className="flex items-center gap-2 border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          <Warning size={16} weight="fill" />
          {portfolio.error ?? actionError}
        </div>
      )}

      <section className="grid grid-cols-2 border-y border-border bg-background-elevated/30 lg:grid-cols-[1.1fr_1fr_1fr_0.85fr]">
        <PortfolioMetric
          icon={Wallet}
          label="持仓市值"
          value={formatMoney(summary.marketValue)}
          detail={`${portfolio.positions.length} 个标的`}
        />
        <PortfolioMetric
          icon={CurrencyCny}
          label="浮动盈亏"
          value={formatMoney(summary.unrealizedPnl)}
          detail={`${summary.unrealizedPnlPct >= 0 ? "+" : ""}${summary.unrealizedPnlPct.toFixed(2)}%`}
          tone={summary.unrealizedPnl >= 0 ? "positive" : "negative"}
          bordered
        />
        <PortfolioMetric
          icon={ArrowUpRight}
          label="当日盈亏"
          value={formatMoney(summary.dailyPnl)}
          detail="按最新日涨跌估算"
          tone={summary.dailyPnl >= 0 ? "positive" : "negative"}
          bordered
          topOnMobile
        />
        <PortfolioMetric
          icon={ShieldWarning}
          label="待复核"
          value={String(summary.reviewCount).padStart(2, "0")}
          detail="触及风险或目标边界"
          tone={summary.reviewCount > 0 ? "warning" : "neutral"}
          bordered
          topOnMobile
        />
      </section>

      <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.6fr)]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/50 shadow-diffusion-sm">
          <div className="flex items-end justify-between gap-4 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">持仓清单</h2>
              <p className="mt-0.5 text-[10px] text-foreground-muted">
                成本、市值、浮盈亏与退出风险统一复核
              </p>
            </div>
            <span className="font-mono text-[9px] text-foreground-subtle">
              {portfolio.positions.length} POSITIONS
            </span>
          </div>

          <div className="hidden grid-cols-[minmax(180px,1.35fr)_100px_108px_80px_118px_84px] gap-3 border-b border-border bg-muted/35 px-4 py-2 font-mono text-[8px] text-foreground-subtle lg:grid">
            <span>ASSET</span>
            <span className="text-right">POSITION</span>
            <span className="text-right">MARKET VALUE</span>
            <span className="text-right">P/L</span>
            <span>RISK</span>
            <span className="text-right">ACTIONS</span>
          </div>

          {!portfolio.ready || marketLoading ? (
            <div className="space-y-px bg-border" aria-label="正在加载持仓">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-20 bg-muted/60 shimmer" />
              ))}
            </div>
          ) : portfolio.positions.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-6 text-center">
              <div className="max-w-sm">
                <Briefcase size={28} weight="duotone" className="mx-auto text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">尚未记录持仓</h3>
                <p className="mt-1.5 text-xs leading-5 text-foreground-muted">
                  添加真实成本和数量后，系统会根据最新研究信号计算盈亏与风险复核项。
                </p>
                <Button
                  variant="outline"
                  onClick={beginCreate}
                  className="mt-4 gap-2"
                >
                  <Plus size={14} />
                  添加第一笔持仓
                </Button>
              </div>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
              className="divide-y divide-border/70"
            >
              {portfolio.positions.map((position) => {
                const instrument = instrumentsById.get(position.instrumentId);
                const snapshot = snapshotById.get(position.instrumentId);
                if (!instrument || !snapshot) return null;
                return (
                  <PositionRow
                    key={position.instrumentId}
                    instrument={instrument}
                    snapshot={snapshot}
                    selected={!creating && selectedId === position.instrumentId}
                    onSelect={() => {
                      setCreating(false);
                      setSelectedId(position.instrumentId);
                    }}
                    onChart={() => setChartInstrument(instrument)}
                    onRemove={() => void removePosition(position.instrumentId)}
                  />
                );
              })}
            </motion.div>
          )}
        </div>

        <aside className="min-w-0 self-start">
          {creating ? (
            <PositionEditor
              key="create"
              title="新增持仓"
              initial={emptyDraft(availableInstruments[0]?.id)}
              instruments={availableInstruments}
              recommendations={recommendationsById}
              onSave={(draft) => void savePosition(draft)}
              onCancel={() => {
                setCreating(false);
                setSelectedId(portfolio.positions[0]?.instrumentId ?? null);
              }}
            />
          ) : selectedPosition ? (
            <PositionEditor
              key={selectedPosition.instrumentId}
              title="持仓参数"
              initial={selectedPosition}
              instruments={catalog.filter(
                (item) => item.id === selectedPosition.instrumentId,
              )}
              recommendations={recommendationsById}
              lockedInstrument
              snapshot={snapshotById.get(selectedPosition.instrumentId)}
              onSave={(draft) => void savePosition(draft)}
            />
          ) : (
            <div className="rounded-lg border border-border bg-background-elevated/50 px-5 py-10 text-center">
              <Calculator size={26} className="mx-auto text-foreground-subtle" />
              <p className="mt-3 text-xs text-foreground-muted">
                选择一笔持仓查看参数和风险边界
              </p>
            </div>
          )}
        </aside>
      </section>

      <footer className="flex items-start gap-2 border-t border-border/70 pt-3 text-[10px] leading-4 text-foreground-subtle sm:text-xs">
        <ShieldWarning size={15} className="mt-0.5 shrink-0" />
        <span>退出风险仅根据本地成本、预设阈值与研究信号生成，不会自动卖出或连接券商。</span>
      </footer>

      <MarketChartDialog
        instrument={chartInstrument}
        open={chartInstrument !== null}
        onOpenChange={(open) => !open && setChartInstrument(null)}
      />
    </div>
  );
}

function PortfolioMetric({
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
  detail: string;
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
      <div className="mt-0.5 truncate text-[8px] text-foreground-subtle sm:text-[9px]">
        {detail}
      </div>
    </div>
  );
}

function PositionRow({
  instrument,
  snapshot,
  selected,
  onSelect,
  onChart,
  onRemove,
}: {
  instrument: Instrument;
  snapshot: PositionSnapshot;
  selected: boolean;
  onSelect: () => void;
  onChart: () => void;
  onRemove: () => void;
}) {
  const positive = snapshot.unrealizedPnl >= 0;
  const meta = riskMeta[snapshot.riskSignal];

  return (
    <motion.div
      layout
      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}
      transition={{ type: "spring", stiffness: 130, damping: 20 }}
      onClick={onSelect}
      className={cn(
        "relative grid cursor-pointer gap-3 px-3 py-3 transition-colors hover:bg-accent/45 lg:grid-cols-[minmax(180px,1.35fr)_100px_108px_80px_118px_84px] lg:items-center lg:px-4",
        selected && "bg-primary/[0.06]",
      )}
    >
      {selected && (
        <motion.span
          layoutId="portfolio-selection"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
        />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold sm:text-sm">{instrument.name}</span>
          <Badge variant="outline" className="h-5 px-1.5 text-[8px]">
            {instrument.kind === "fund" ? "基金" : "A 股"}
          </Badge>
        </div>
        <div className="mt-1 font-mono text-[9px] text-foreground-subtle">
          {instrument.symbol} · 成本 {snapshot.position.averageCost.toFixed(3)}
        </div>
      </div>
      <ValueCell label="持仓数量" value={snapshot.position.quantity.toLocaleString("zh-CN")} />
      <ValueCell label="持仓市值" value={formatMoney(snapshot.marketValue)} />
      <div className="flex items-end justify-between lg:block lg:text-right">
        <span className="text-[9px] text-foreground-subtle lg:hidden">浮动盈亏</span>
        <div>
          <div
            className={cn(
              "font-mono text-xs font-semibold",
              positive ? "text-accent-emerald" : "text-accent-rose",
            )}
          >
            {positive ? "+" : ""}{snapshot.unrealizedPnlPct.toFixed(2)}%
          </div>
          <div className="mt-0.5 font-mono text-[8px] text-foreground-subtle">
            {formatMoney(snapshot.unrealizedPnl)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between lg:block">
        <span className="text-[9px] text-foreground-subtle lg:hidden">退出风险</span>
        <Badge variant="outline" className={cn("text-[8px]", meta.className)}>
          {meta.label}
        </Badge>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-2 lg:border-t-0 lg:pt-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChart();
          }}
          aria-label={`查看 ${instrument.name} K 线`}
          title="查看 K 线与买点"
          className="grid h-8 w-8 place-items-center text-foreground-subtle hover:bg-accent hover:text-foreground active:scale-[0.96]"
        >
          <ChartLineUp size={15} />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`删除 ${instrument.name} 持仓`}
          title="删除持仓记录"
          className="grid h-8 w-8 place-items-center text-foreground-subtle hover:bg-accent hover:text-accent-rose active:scale-[0.96]"
        >
          <Trash size={15} />
        </button>
      </div>
    </motion.div>
  );
}

function ValueCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between lg:block lg:text-right">
      <span className="text-[9px] text-foreground-subtle lg:hidden">{label}</span>
      <span className="font-mono text-[10px] font-medium">{value}</span>
    </div>
  );
}

function PositionEditor({
  title,
  initial,
  instruments,
  recommendations,
  lockedInstrument,
  snapshot,
  onSave,
  onCancel,
}: {
  title: string;
  initial: PortfolioPositionDraft;
  instruments: Instrument[];
  recommendations: Map<string, Recommendation>;
  lockedInstrument?: boolean;
  snapshot?: PositionSnapshot;
  onSave: (draft: PortfolioPositionDraft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const selectedInstrument = instruments.find(
    (item) => item.id === draft.instrumentId,
  );
  const recommendation = recommendations.get(draft.instrumentId);
  const preview =
    recommendation && draft.quantity > 0 && draft.averageCost > 0
      ? buildPositionSnapshot(
          { ...draft, updatedAt: new Date().toISOString() },
          recommendation,
        )
      : snapshot;

  const patch = (value: Partial<PortfolioPositionDraft>) =>
    setDraft((current) => ({ ...current, ...value }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      className="overflow-hidden rounded-lg border border-border bg-background-elevated/50 shadow-diffusion-sm"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="font-mono text-[9px] text-primary">POSITION INSPECTOR</div>
          <h2 className="mt-1 text-sm font-semibold">{title}</h2>
        </div>
        {preview && (
          <Badge
            variant="outline"
            className={cn("text-[8px]", riskMeta[preview.riskSignal].className)}
          >
            {riskMeta[preview.riskSignal].label}
          </Badge>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        <label className="block">
          <span className="text-[10px] font-medium">持仓标的</span>
          <select
            value={draft.instrumentId}
            disabled={lockedInstrument}
            onChange={(event) => {
              const instrumentId = event.target.value;
              const price = recommendations.get(instrumentId)?.price ?? 0;
              patch({ instrumentId, averageCost: price });
            }}
            className="mt-1.5 h-9 w-full border border-input bg-background px-2.5 text-xs outline-none focus:border-primary disabled:opacity-70"
          >
            {instruments.length === 0 && <option value="">没有可添加的标的</option>}
            {instruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.name} · {instrument.symbol}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="持仓数量"
            value={draft.quantity}
            min={0}
            step="any"
            onChange={(quantity) => patch({ quantity })}
          />
          <NumberField
            label="平均成本"
            value={draft.averageCost}
            min={0}
            step="0.001"
            onChange={(averageCost) => patch({ averageCost })}
          />
        </div>

        <label className="block">
          <span className="text-[10px] font-medium">建仓日期</span>
          <input
            type="date"
            value={draft.openedAt}
            max={today()}
            onChange={(event) => patch({ openedAt: event.target.value })}
            className="mt-1.5 h-9 w-full border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="止损复核线 %"
            value={draft.stopLossPct}
            min={0.1}
            max={100}
            step="0.1"
            onChange={(stopLossPct) => patch({ stopLossPct })}
          />
          <NumberField
            label="止盈复核线 %"
            value={draft.takeProfitPct}
            min={0.1}
            max={500}
            step="0.1"
            onChange={(takeProfitPct) => patch({ takeProfitPct })}
          />
        </div>

        <label className="block">
          <span className="flex items-center gap-2 text-[10px] font-medium">
            <NotePencil size={13} className="text-primary" />
            持仓备注
          </span>
          <textarea
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
            rows={2}
            placeholder="记录建仓逻辑或退出条件"
            className="mt-1.5 w-full resize-none border border-input bg-background px-2.5 py-2 text-[11px] leading-4 outline-none focus:border-primary"
          />
        </label>

        {preview && selectedInstrument && (
          <div className="border-l-2 border-primary bg-primary/[0.035] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[10px] font-medium">
                {preview.unrealizedPnl >= 0 ? (
                  <ArrowUpRight size={13} className="text-accent-emerald" />
                ) : (
                  <ArrowDownRight size={13} className="text-accent-rose" />
                )}
                参数预览
              </span>
              <span className="font-mono text-[9px] text-foreground-subtle">
                {recommendation?.asOfDate}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
              <PreviewValue label="市值" value={formatMoney(preview.marketValue)} />
              <PreviewValue
                label="浮盈亏"
                value={`${preview.unrealizedPnlPct >= 0 ? "+" : ""}${preview.unrealizedPnlPct.toFixed(2)}%`}
              />
            </div>
            <p className="mt-2 text-[9px] leading-4 text-foreground-muted">
              {preview.riskReason}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button
          onClick={() => onSave(draft)}
          disabled={!draft.instrumentId}
          className="gap-2 active:scale-[0.98]"
        >
          <FloppyDisk size={14} />
          保存持仓
        </Button>
      </div>
    </motion.div>
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

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-foreground-subtle">{label}</div>
      <div className="mt-0.5 truncate font-mono font-semibold">{value}</div>
    </div>
  );
}
