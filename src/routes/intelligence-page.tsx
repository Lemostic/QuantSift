import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Clock,
  FileMagnifyingGlass,
  Lightning,
  Robot,
  Sparkle,
  Warning,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlossaryText } from "@/components/glossary/term-tooltip";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { useWatchlist } from "@/watchlist/use-watchlist";
import {
  filterSessionsByDimension,
  type TimeDimension,
} from "@/ai/session-repository";
import { useAnalysisCenter } from "@/ai/use-analysis-center";
import { useAppStore } from "@/store/app-store";
import type {
  AdviceSignal,
  AnalysisSession,
  ProviderOutcome,
} from "@/ai/types";

const SIGNAL_META: Record<
  AdviceSignal,
  { label: string; className: string }
> = {
  buy: {
    label: "买入",
    className:
      "border-accent-emerald/35 bg-accent-emerald/[0.07] text-accent-emerald",
  },
  sell: {
    label: "卖出",
    className:
      "border-accent-rose/35 bg-accent-rose/[0.07] text-accent-rose",
  },
  hold: {
    label: "持有",
    className:
      "border-accent-amber/35 bg-accent-amber/[0.07] text-accent-amber",
  },
  watch: {
    label: "观望",
    className:
      "border-primary/35 bg-primary/[0.07] text-primary",
  },
};

const TIME_DIMENSIONS: Array<{ id: TimeDimension; label: string }> = [
  { id: "today", label: "今日" },
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "all", label: "全部" },
];

export function IntelligencePage() {
  const watchlist = useWatchlist();
  const center = useAnalysisCenter();
  const schedule = useAppStore((s) => s.aiIntradaySchedule);
  const enabledProviderCount = useAppStore(
    (s) => s.aiProviders.filter((p) => p.enabled && p.apiKey).length,
  );
  const [dimension, setDimension] = useState<TimeDimension>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const autoAnalyzeIds = useMemo(
    () =>
      watchlist.entries
        .filter((entry) => entry.enabled && entry.autoAnalyze)
        .map((entry) => entry.instrumentId),
    [watchlist.entries],
  );

  const visible = useMemo(
    () => filterSessionsByDimension(center.sessions, dimension),
    [center.sessions, dimension],
  );
  const selected =
    visible.find((session) => session.id === selectedId) ?? visible[0] ?? null;

  const runNow = async () => {
    await center.runNow(autoAnalyzeIds);
  };

  const scheduleLabel = schedule.enabled
    ? `每 ${schedule.intervalMinutes} 分钟 · ${String(Math.floor(schedule.startMinutes / 60)).padStart(2, "0")}:${String(schedule.startMinutes % 60).padStart(2, "0")}–${String(Math.floor(schedule.endMinutes / 60)).padStart(2, "0")}:${String(schedule.endMinutes % 60).padStart(2, "0")}`
    : "未启用";

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "h-auto min-h-full gap-4 px-4 py-4 sm:px-5 lg:px-7 lg:py-5",
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
        <div>
          <div className="font-mono text-[9px] font-semibold text-primary">
            AI / ANALYSIS WORKBENCH
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">智能分析</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              多模型并行研判 · 网络研究 · 随机因子 · 会话留存
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="font-mono text-[9px] text-foreground-subtle sm:text-right">
            <div>SCHEDULE {schedule.enabled ? "ON" : "OFF"}</div>
            <div className="mt-0.5 text-foreground-muted">{scheduleLabel}</div>
          </div>
          <Button
            variant="outline"
            onClick={() => void runNow()}
            disabled={center.running || autoAnalyzeIds.length === 0}
            className="gap-2 active:scale-[0.98]"
          >
            <Lightning
              size={15}
              className={cn(center.running && "animate-pulse")}
            />
            {center.running ? "分析中" : "立即分析"}
          </Button>
        </div>
      </header>

      {enabledProviderCount === 0 && (
        <div className="flex items-start justify-between gap-4 border-l-2 border-accent-amber bg-accent-amber/[0.05] px-3 py-2.5 sm:items-center sm:px-4">
          <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
            <Warning
              size={16}
              weight="fill"
              className="mt-0.5 shrink-0 text-accent-amber sm:mt-0"
            />
            <p className="text-[11px] leading-4 text-foreground-muted sm:text-xs">
              尚未启用任何 AI 模型（含密钥）。请到“偏好设置 → AI 分析模型”配置；
              未配置时分析将只生成基础因子快照，无法给出模型结论。
            </p>
          </div>
          <Badge variant="outline" className="hidden shrink-0 font-mono text-[9px] sm:inline-flex">
            NO MODEL
          </Badge>
        </div>
      )}

      {autoAnalyzeIds.length === 0 && (
        <div className="flex items-start justify-between gap-4 border-l-2 border-accent-amber bg-accent-amber/[0.05] px-3 py-2.5 sm:items-center sm:px-4">
          <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
            <Warning
              size={16}
              weight="fill"
              className="mt-0.5 shrink-0 text-accent-amber sm:mt-0"
            />
            <p className="text-[11px] leading-4 text-foreground-muted sm:text-xs">
              没有标的参与智能分析。到“我的观察列表”为标的点亮 ✦ 图标即可加入
              定时 AI 推荐扫描。
            </p>
          </div>
        </div>
      )}

      {center.error && (
        <div className="flex items-start gap-2.5 border-l-2 border-accent-rose bg-accent-rose/[0.04] px-3 py-2.5">
          <Warning size={15} className="mt-0.5 shrink-0 text-accent-rose" />
          <p className="text-[11px] leading-4 text-foreground-muted">{center.error}</p>
        </div>
      )}

      {!center.ready ? (
        <div aria-label="正在加载分析会话" className="h-72 bg-muted/50 shimmer" />
      ) : visible.length === 0 ? (
        <div className="grid min-h-72 place-items-center border border-border p-6 text-center">
          <div className="max-w-md">
            <Brain size={30} weight="duotone" className="mx-auto text-foreground-subtle" />
            <h2 className="mt-3 text-base font-semibold">还没有分析会话</h2>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              点击“立即分析”或在交易时段内开启定时扫描后，这里会按会话形式
              留存每次分析的结论、网络研究简报与随机因子种子，供后续复盘参考。
            </p>
          </div>
        </div>
      ) : (
        <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(280px,0.62fr)_minmax(0,2fr)]">
          <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/55">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
              <h2 className="text-sm font-semibold">分析会话</h2>
              <span className="font-mono text-[9px] text-foreground-subtle">
                {visible.length} SESSIONS
              </span>
            </div>
            <div className="flex border-b border-border/70">
              {TIME_DIMENSIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={dimension === item.id}
                  onClick={() => setDimension(item.id)}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-medium transition-colors",
                    dimension === item.id
                      ? "bg-primary/[0.08] text-primary"
                      : "text-foreground-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="max-h-[62vh] divide-y divide-border/70 overflow-y-auto">
              {visible.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  selected={session.id === selected?.id}
                  onSelect={() => setSelectedId(session.id)}
                />
              ))}
            </div>
          </aside>

          {selected ? (
            <SessionDetail
              session={selected}
              memory={center.sessions
                .filter(
                  (item) =>
                    item.instrumentId === selected.instrumentId &&
                    item.id !== selected.id,
                )
                .slice(0, 5)}
            />
          ) : (
            <div className="grid min-h-72 place-items-center border border-border text-xs text-foreground-muted">
              选择左侧会话查看详情
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SessionRow({
  session,
  selected,
  onSelect,
}: {
  session: AnalysisSession;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = SIGNAL_META[session.advice.signal];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full px-3 py-3 text-left transition-colors hover:bg-accent/55 sm:px-4",
        selected && "bg-primary/[0.075]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold">
          {session.instrumentName}
        </span>
        <Badge variant="outline" className={cn("shrink-0 text-[8px]", meta.className)}>
          {meta.label}
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-foreground-subtle">
        <span>{session.asOfDate}</span>
        <span>{session.trigger === "scheduled" ? "定时" : "手动"}</span>
        <span>置信 {session.advice.confidence}</span>
      </div>
    </button>
  );
}

function SessionDetail({
  session,
  memory,
}: {
  session: AnalysisSession;
  memory: AnalysisSession[];
}) {
  const meta = SIGNAL_META[session.advice.signal];
  return (
    <motion.div
      key={session.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/55"
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{session.instrumentName}</h2>
            <Badge variant="outline" className={cn("text-[9px]", meta.className)}>
              {meta.label} · {session.advice.confidence}/100
            </Badge>
          </div>
          <div className="mt-1 font-mono text-[9px] text-foreground-subtle">
            {session.instrumentId} · {session.asOfDate} · 现价{" "}
            {session.priceAtAnalysis.toFixed(session.priceAtAnalysis > 100 ? 2 : 3)} ·
            基础分 {session.baseScore}
          </div>
        </div>
        <div className="font-mono text-[9px] text-foreground-subtle">
          种子 {session.seed}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-md border border-border/70 bg-background/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <Sparkle size={13} className="text-primary" />
              结论摘要
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-foreground-muted">
              {session.advice.summary}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <Robot size={13} className="text-primary" />
              模型结论（{session.providers.length}）
            </div>
            <div className="mt-2 space-y-2">
              {session.providers.map((provider) => (
                <ProviderCard key={provider.providerId} outcome={provider} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <FileMagnifyingGlass size={13} className="text-primary" />
              网络研究简报（{session.research.length}）
            </div>
            {session.research.length > 0 ? (
              <div className="mt-2 space-y-2">
                {session.research.map((brief, index) => (
                  <div
                    key={`${brief.url}-${index}`}
                    className="rounded-md border border-border/60 bg-background/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium">
                        {brief.title}
                      </span>
                      <span className="shrink-0 font-mono text-[8px] text-foreground-subtle">
                        {brief.source}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-foreground-muted">
                      {brief.snippet}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[10px] text-foreground-subtle">
                本次未获取到网络简报。
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <Clock size={13} className="text-primary" />
              <GlossaryText text="随机因子" />（种子 {session.seed}）
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {session.factorVariation.length > 0 ? (
                session.factorVariation.map((entry) => (
                  <span
                    key={entry.tagId}
                    className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[9px] text-foreground-muted"
                  >
                    {entry.label} · {entry.emphasis}
                    {entry.direction === "positive"
                      ? " 偏多"
                      : entry.direction === "negative"
                        ? " 偏空"
                        : " 中性"}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-foreground-subtle">未启用</span>
              )}
            </div>
          </div>

          <MemoryPanel sessions={memory} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold">
            <Brain size={13} className="text-primary" />
            会话内容
          </div>
          <div className="mt-2 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {session.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-md px-3 py-2",
                  message.role === "user"
                    ? "border border-primary/25 bg-primary/[0.06]"
                    : "border border-border/60 bg-background/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold text-foreground-subtle">
                    {message.role === "user"
                      ? "分析请求"
                      : message.providerId
                        ? `模型 · ${message.providerId}`
                        : "系统"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-foreground-muted">
                  {message.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ProviderCard({ outcome }: { outcome: ProviderOutcome }) {
  if (outcome.status === "error") {
    return (
      <div className="rounded-md border border-accent-rose/30 bg-accent-rose/[0.04] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold">{outcome.label}</span>
          <span className="font-mono text-[8px] text-accent-rose">ERROR</span>
        </div>
        <p className="mt-1 text-[10px] text-foreground-muted">{outcome.error}</p>
      </div>
    );
  }
  const meta = SIGNAL_META[outcome.signal ?? "watch"];
  return (
    <div className="rounded-md border border-border/60 bg-background/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold">
          {outcome.label}
          <span className="ml-1.5 font-mono text-[8px] font-normal text-foreground-subtle">
            {outcome.model}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[8px] text-foreground-subtle">
            置信 {outcome.confidence}
          </span>
          <Badge variant="outline" className={cn("text-[8px]", meta.className)}>
            {meta.label}
          </Badge>
        </div>
      </div>
      {outcome.summary && (
        <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-foreground-muted">
          {outcome.summary}
        </p>
      )}
    </div>
  );
}

function MemoryPanel({ sessions }: { sessions: AnalysisSession[] }) {
  if (sessions.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 text-[10px] font-semibold">
          <Clock size={13} className="text-primary" />
          历史记忆
        </div>
        <p className="mt-1.5 text-[10px] text-foreground-subtle">
          该标的前尚无更早的分析会话。
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] font-semibold">
        <Clock size={13} className="text-primary" />
        <GlossaryText text="历史记忆" />（同标的 {sessions.length} 条）
      </div>
      <div className="mt-2 space-y-1.5">
        {sessions.map((session) => {
          const meta = SIGNAL_META[session.advice.signal];
          return (
            <div
              key={session.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/20 px-2.5 py-1.5"
            >
              <span className="truncate font-mono text-[9px] text-foreground-subtle">
                {session.asOfDate}
              </span>
              <span className="truncate text-[9px] text-foreground-muted">
                {session.advice.summary.slice(0, 40)}
              </span>
              <Badge variant="outline" className={cn("shrink-0 text-[8px]", meta.className)}>
                {meta.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
