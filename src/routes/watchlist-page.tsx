import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChartLineUp,
  CheckCircle,
  MagnifyingGlass,
  NotePencil,
  PauseCircle,
  Plus,
  Tag,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { configuredProvider } from "@/data/provider-registry";
import { loadRecommendations } from "@/data/recommendation-service";
import type {
  Instrument,
  Recommendation,
  RecommendationSignal,
} from "@/quant/types";
import { useWatchlist } from "@/watchlist/use-watchlist";
import type { WatchlistEntry } from "@/watchlist/repository";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";
import { MarketChartDialog } from "@/components/market-chart/market-chart-dialog";

const signalMeta: Record<
  RecommendationSignal,
  { label: string; className: string }
> = {
  buy_watch: {
    label: "买入观察",
    className: "border-accent-emerald/35 text-accent-emerald",
  },
  hold: {
    label: "继续观察",
    className: "border-accent-amber/35 text-accent-amber",
  },
  avoid: {
    label: "暂不交易",
    className: "border-accent-rose/35 text-accent-rose",
  },
};

export function WatchlistPage() {
  const watchlist = useWatchlist();
  const [catalog, setCatalog] = useState<Instrument[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [query, setQuery] = useState("");
  const [monitorQuery, setMonitorQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [chartInstrument, setChartInstrument] = useState<Instrument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void configuredProvider().listInstruments().then(setCatalog).catch((cause) => {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    });
  }, []);

  const entryIds = useMemo(
    () => new Set(watchlist.entries.map((entry) => entry.instrumentId)),
    [watchlist.entries],
  );
  const entryIdsKey = [...entryIds].join("|");
  const instrumentsById = useMemo(
    () => new Map(catalog.map((instrument) => [instrument.id, instrument])),
    [catalog],
  );
  const recommendationsById = useMemo(
    () =>
      new Map(
        recommendations.map((recommendation) => [
          recommendation.instrument.id,
          recommendation,
        ]),
      ),
    [recommendations],
  );

  useEffect(() => {
    if (!watchlist.ready || entryIds.size === 0) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    void loadRecommendations(configuredProvider(), [...entryIds])
      .then((next) => {
        if (!cancelled) setRecommendations(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setActionError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entryIdsKey, watchlist.ready]);

  useEffect(() => {
    if (!selectedId && watchlist.entries[0]) {
      setSelectedId(watchlist.entries[0].instrumentId);
    } else if (selectedId && !entryIds.has(selectedId)) {
      setSelectedId(watchlist.entries[0]?.instrumentId ?? null);
    }
  }, [entryIdsKey, selectedId, watchlist.entries]);

  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((instrument) => {
      if (entryIds.has(instrument.id)) return false;
      if (!normalized) return true;
      return (
        instrument.name.toLowerCase().includes(normalized) ||
        instrument.symbol.includes(normalized)
      );
    });
  }, [catalog, entryIds, query]);

  const visibleEntries = useMemo(() => {
    const normalized = monitorQuery.trim().toLowerCase();
    if (!normalized) return watchlist.entries;
    return watchlist.entries.filter((entry) => {
      const instrument = instrumentsById.get(entry.instrumentId);
      return (
        instrument?.name.toLowerCase().includes(normalized) ||
        instrument?.symbol.includes(normalized) ||
        entry.note.toLowerCase().includes(normalized) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(normalized))
      );
    });
  }, [instrumentsById, monitorQuery, watchlist.entries]);

  const selectedEntry = watchlist.entries.find(
    (entry) => entry.instrumentId === selectedId,
  );
  const selectedInstrument = selectedEntry
    ? instrumentsById.get(selectedEntry.instrumentId)
    : undefined;
  const activeCount = watchlist.entries.filter((entry) => entry.enabled).length;
  const buyWatchCount = recommendations.filter(
    (item) => item.signal === "buy_watch",
  ).length;
  const fundCount = watchlist.entries.filter(
    (entry) => instrumentsById.get(entry.instrumentId)?.kind === "fund",
  ).length;

  const runAction = async (action: () => Promise<void>) => {
    try {
      await action();
      setActionError(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
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
            WATCHLIST / SIGNAL MONITOR
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">监控中心</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              管理观察范围并校准每个标的的研究上下文
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-foreground-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald" />
          {activeCount} ACTIVE / {watchlist.entries.length} TOTAL
        </div>
      </header>

      {(watchlist.error || actionError) && (
        <div className="flex items-center gap-2 border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          <Warning size={16} weight="fill" />
          {watchlist.error ?? actionError}
        </div>
      )}

      <section className="grid grid-cols-2 border-y border-border bg-background-elevated/30 lg:grid-cols-[0.8fr_0.8fr_0.8fr_1.4fr]">
        <Metric label="已启用" value={String(activeCount)} detail="参与每日扫描" />
        <Metric label="买入观察" value={String(buyWatchCount)} detail="等待人工复核" bordered />
        <Metric label="基金占比" value={`${fundCount}/${watchlist.entries.length}`} detail="股票与公募基金" bordered topOnMobile />
        <Metric label="数据模式" value="本地优先" detail="备注、标签与策略均保存在当前设备" bordered topOnMobile />
      </section>

      <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(310px,0.55fr)]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/50 shadow-diffusion-sm">
          <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div>
              <h2 className="text-sm font-semibold">监控队列</h2>
              <p className="mt-0.5 text-[10px] text-foreground-muted">
                实时报价位、涨跌、评分与扫描状态
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <MagnifyingGlass
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle"
              />
              <input
                value={monitorQuery}
                onChange={(event) => setMonitorQuery(event.target.value)}
                placeholder="筛选名称、代码或标签"
                className="h-8 w-full border border-input bg-background pl-8 pr-3 text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(190px,1.5fr)_96px_90px_58px_74px_106px] gap-3 border-b border-border bg-muted/35 px-4 py-2 font-mono text-[8px] text-foreground-subtle lg:grid">
            <span>ASSET</span>
            <span className="text-right">PRICE</span>
            <span>SIGNAL</span>
            <span className="text-right">SCORE</span>
            <span className="text-center">SCAN</span>
            <span className="text-right">ACTIONS</span>
          </div>

          {!watchlist.ready ? (
            <div className="space-y-px bg-border" aria-label="正在加载观察列表">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 bg-muted/60 shimmer" />
              ))}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div>
                <MagnifyingGlass size={24} className="mx-auto text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">
                  {watchlist.entries.length === 0 ? "还没有监控标的" : "没有匹配结果"}
                </h3>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  {watchlist.entries.length === 0
                    ? "从右侧资产目录添加股票或基金。"
                    : "换一个名称、代码或标签继续筛选。"}
                </p>
              </div>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.045 } } }}
              className="divide-y divide-border/70"
            >
              {visibleEntries.map((entry) => {
                const instrument = instrumentsById.get(entry.instrumentId);
                if (!instrument) return null;
                return (
                  <WatchlistRow
                    key={entry.instrumentId}
                    entry={entry}
                    instrument={instrument}
                    recommendation={recommendationsById.get(entry.instrumentId)}
                    selected={entry.instrumentId === selectedId}
                    onSelect={() => setSelectedId(entry.instrumentId)}
                    onUpdate={(value) =>
                      runAction(() => watchlist.update(entry.instrumentId, value))
                    }
                    onRemove={() =>
                      runAction(() => watchlist.remove(entry.instrumentId))
                    }
                    onShowChart={() => setChartInstrument(instrument)}
                  />
                );
              })}
            </motion.div>
          )}
        </div>

        <aside className="min-w-0 space-y-4 self-start">
          {selectedEntry && selectedInstrument ? (
            <MonitorInspector
              entry={selectedEntry}
              instrument={selectedInstrument}
              recommendation={recommendationsById.get(selectedEntry.instrumentId)}
              onUpdate={(value) =>
                runAction(() => watchlist.update(selectedEntry.instrumentId, value))
              }
              onShowChart={() => setChartInstrument(selectedInstrument)}
            />
          ) : (
            <div className="border border-border px-4 py-8 text-center text-xs text-foreground-muted">
              选择一个监控标的查看详情
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/50">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">资产目录</h2>
              <div className="relative mt-2.5">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="输入代码或名称"
                  className="h-8 w-full border border-input bg-background pl-8 pr-3 text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>
            <div className="max-h-56 divide-y divide-border/70 overflow-y-auto">
              {candidates.length === 0 ? (
                <div className="px-4 py-7 text-center text-[11px] text-foreground-muted">
                  没有可添加的匹配标的
                </div>
              ) : (
                candidates.map((instrument) => (
                  <div
                    key={instrument.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{instrument.name}</div>
                      <div className="mt-0.5 font-mono text-[9px] text-foreground-subtle">
                        {instrument.symbol} · {instrument.kind === "fund" ? "基金" : "A 股"}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`添加 ${instrument.name}`}
                      title={`添加 ${instrument.name}`}
                      onClick={() => void runAction(() => watchlist.add(instrument.id))}
                      className="h-7 w-7 shrink-0 active:scale-[0.96]"
                    >
                      <Plus size={15} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

      <MarketChartDialog
        instrument={chartInstrument}
        open={chartInstrument !== null}
        onOpenChange={(open) => !open && setChartInstrument(null)}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  bordered,
  topOnMobile,
}: {
  label: string;
  value: string;
  detail: string;
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
      <div className="text-[9px] text-foreground-muted sm:text-[10px]">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold sm:text-xl">{value}</div>
      <div className="mt-0.5 truncate text-[8px] text-foreground-subtle sm:text-[9px]">{detail}</div>
    </div>
  );
}

function WatchlistRow({
  entry,
  instrument,
  recommendation,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onShowChart,
}: {
  entry: WatchlistEntry;
  instrument: Instrument;
  recommendation?: Recommendation;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (value: { enabled?: boolean }) => void;
  onRemove: () => void;
  onShowChart: () => void;
}) {
  const positive = (recommendation?.dailyChangePct ?? 0) >= 0;
  const meta = recommendation ? signalMeta[recommendation.signal] : null;

  return (
    <motion.div
      layout
      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}
      transition={{ type: "spring", stiffness: 130, damping: 20 }}
      onClick={onSelect}
      className={cn(
        "relative grid cursor-pointer gap-3 px-3 py-3 transition-colors hover:bg-accent/45 lg:grid-cols-[minmax(190px,1.5fr)_96px_90px_58px_74px_106px] lg:items-center lg:px-4",
        selected && "bg-primary/[0.06]",
        !entry.enabled && "opacity-60",
      )}
    >
      {selected && (
        <motion.span
          layoutId="watchlist-selection"
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
        <div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[9px] text-foreground-subtle">
          <span>{instrument.symbol}</span>
          <span>{instrument.exchange}</span>
          {entry.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="truncate text-foreground-muted">#{tag}</span>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between lg:block lg:text-right">
        <span className="text-[9px] text-foreground-subtle lg:hidden">最新价</span>
        <div>
          <div className="font-mono text-xs font-medium">
            {recommendation
              ? recommendation.price.toFixed(recommendation.price > 100 ? 2 : 3)
              : "--"}
          </div>
          {recommendation && (
            <div
              className={cn(
                "mt-0.5 flex items-center justify-end font-mono text-[9px]",
                positive ? "text-accent-emerald" : "text-accent-rose",
              )}
            >
              {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {Math.abs(recommendation.dailyChangePct).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between lg:block">
        <span className="text-[9px] text-foreground-subtle lg:hidden">研究信号</span>
        {meta ? (
          <Badge variant="outline" className={cn("text-[8px]", meta.className)}>
            {meta.label}
          </Badge>
        ) : (
          <span className="font-mono text-[9px] text-foreground-subtle">计算中</span>
        )}
      </div>

      <div className="hidden text-right font-mono text-base font-semibold text-primary lg:block">
        {recommendation?.score ?? "--"}
      </div>

      <div className="hidden justify-center lg:flex">
        <MonitorToggle
          enabled={entry.enabled}
          label={entry.enabled ? "暂停扫描" : "恢复扫描"}
          onClick={() => onUpdate({ enabled: !entry.enabled })}
        />
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-2 lg:border-t-0 lg:pt-0">
        <div className="mr-auto flex items-center gap-2 lg:hidden">
          <MonitorToggle
            enabled={entry.enabled}
            label={entry.enabled ? "暂停扫描" : "恢复扫描"}
            onClick={() => onUpdate({ enabled: !entry.enabled })}
          />
          <span className="text-[9px] text-foreground-muted">
            {entry.enabled ? "扫描已启用" : "扫描已暂停"}
          </span>
        </div>
        <IconAction label={`查看 ${instrument.name} K 线`} onClick={onShowChart}>
          <ChartLineUp size={15} />
        </IconAction>
        <IconAction label={`删除 ${instrument.name}`} onClick={onRemove} danger>
          <Trash size={15} />
        </IconAction>
      </div>
    </motion.div>
  );
}

function MonitorToggle({
  enabled,
  label,
  onClick,
}: {
  enabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors active:scale-[0.96]",
        enabled
          ? "border-primary/40 bg-primary/20"
          : "border-border-strong bg-muted",
      )}
    >
      <motion.span
        layout
        animate={{ x: enabled ? 17 : 2 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full",
          enabled ? "bg-primary" : "bg-foreground-subtle",
        )}
      />
    </button>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid h-8 w-8 place-items-center text-foreground-subtle transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]",
        danger && "hover:text-accent-rose",
      )}
    >
      {children}
    </button>
  );
}

function MonitorInspector({
  entry,
  instrument,
  recommendation,
  onUpdate,
  onShowChart,
}: {
  entry: WatchlistEntry;
  instrument: Instrument;
  recommendation?: Recommendation;
  onUpdate: (value: { note?: string; tags?: string[] }) => void;
  onShowChart: () => void;
}) {
  const [note, setNote] = useState(entry.note);
  const [tags, setTags] = useState(entry.tags.join(", "));

  useEffect(() => setNote(entry.note), [entry.instrumentId, entry.note]);
  useEffect(() => setTags(entry.tags.join(", ")), [entry.instrumentId, entry.tags]);

  return (
    <motion.div
      key={entry.instrumentId}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      className="overflow-hidden rounded-lg border border-border bg-background-elevated/50 shadow-diffusion-sm"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[9px] text-primary">SELECTED MONITOR</div>
          <h2 className="mt-1 truncate text-sm font-semibold">{instrument.name}</h2>
          <div className="mt-0.5 font-mono text-[9px] text-foreground-subtle">
            {instrument.symbol} · {instrument.exchange}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onShowChart}
          aria-label={`查看 ${instrument.name} K 线`}
          title="查看 K 线与买点"
          className="h-8 w-8"
        >
          <ChartLineUp size={16} />
        </Button>
      </div>

      {recommendation && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-3">
          <div>
            <Badge
              variant="outline"
              className={cn("text-[8px]", signalMeta[recommendation.signal].className)}
            >
              {signalMeta[recommendation.signal].label}
            </Badge>
            <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-foreground-muted">
              {recommendation.reasons[0]}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold text-primary">
              {recommendation.score}
            </div>
            <div className="text-[8px] text-foreground-subtle">综合评分</div>
          </div>
        </div>
      )}

      <div className="space-y-3 px-4 py-4">
        <label className="block">
          <span className="flex items-center gap-2 text-[10px] font-medium">
            <NotePencil size={13} className="text-primary" />
            观察备注
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => note !== entry.note && onUpdate({ note })}
            placeholder="记录关注逻辑、等待条件或风险边界"
            rows={3}
            className="mt-1.5 w-full resize-none border border-input bg-background px-2.5 py-2 text-[11px] leading-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <label className="block">
          <span className="flex items-center gap-2 text-[10px] font-medium">
            <Tag size={13} className="text-primary" />
            研究标签
          </span>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            onBlur={() => {
              const next = tags.split(/[,，]/).map((tag) => tag.trim());
              if (next.join(",") !== entry.tags.join(",")) onUpdate({ tags: next });
            }}
            placeholder="重点监控，AI主题"
            className="mt-1.5 h-8 w-full border border-input bg-background px-2.5 text-[11px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex items-center gap-2 border-t border-border/70 pt-3 text-[9px] text-foreground-subtle">
          {entry.enabled ? (
            <CheckCircle size={13} weight="fill" className="text-accent-emerald" />
          ) : (
            <PauseCircle size={13} weight="fill" className="text-accent-amber" />
          )}
          {entry.enabled ? "已纳入下一次扫描" : "当前已暂停扫描"}
          <span className="ml-auto">
            {new Date(entry.addedAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
