import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Database,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { loadRecommendations } from "@/data/recommendation-service";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import type { Recommendation, RecommendationSignal } from "@/quant/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";

const signalMeta: Record<RecommendationSignal, { label: string; className: string }> = {
  buy_watch: { label: "买入观察", className: "border-accent-emerald/35 bg-accent-emerald/10 text-accent-emerald" },
  hold: { label: "继续观察", className: "border-accent-amber/35 bg-accent-amber/10 text-accent-amber" },
  avoid: { label: "暂不交易", className: "border-accent-rose/35 bg-accent-rose/10 text-accent-rose" },
};

export function HomePage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadRecommendations(recordedMarketDataProvider);
      setRecommendations(next);
      setSelectedId((current) => current ?? next[0]?.instrument.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(
    () => recommendations.find((item) => item.instrument.id === selectedId) ?? recommendations[0],
    [recommendations, selectedId],
  );
  const buyCount = recommendations.filter((item) => item.signal === "buy_watch").length;
  const watchCount = recommendations.filter((item) => item.signal === "hold").length;

  return (
    <div className={cn(PAGE_CONTAINER_CLASS, "relative h-auto min-h-full gap-6 px-5 py-7 lg:px-8")}>
      <header className="flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            QuantSift / 日频决策台
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">今天，哪些标的值得继续研究？</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-muted">
            用本地缓存的日线数据计算透明因子分数。这里给出研究优先级，不是自动下单指令，也不承诺收益。
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading} className="w-fit gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "计算中" : "刷新样例数据"}
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile icon={TrendingUp} label="买入观察" value={String(buyCount)} detail="满足趋势与动量条件" tone="emerald" />
        <SummaryTile icon={BarChart3} label="继续观察" value={String(watchCount)} detail="等待更明确的信号" tone="amber" />
        <SummaryTile icon={Database} label="数据状态" value="日线" detail="最后更新 2026-08-10 15:30" tone="blue" />
      </section>

      {error && <div className="rounded-lg border border-accent-rose/30 bg-accent-rose/10 px-4 py-3 text-sm text-accent-rose">无法生成推荐：{error}</div>}

      <section className="grid min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/70">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">观察列表</h2>
              <p className="mt-1 text-xs text-foreground-muted">按综合分数排序 · 共 {recommendations.length} 个标的</p>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">RECORDED FIXTURE</Badge>
          </div>
          <div className="divide-y divide-border/70">
            {recommendations.map((recommendation) => <RecommendationRow key={recommendation.instrument.id} recommendation={recommendation} selected={recommendation.instrument.id === selected?.instrument.id} onSelect={() => setSelectedId(recommendation.instrument.id)} />)}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background-elevated/70">
          {selected ? <RecommendationDetail recommendation={selected} /> : <div className="p-6 text-sm text-foreground-muted">正在加载推荐...</div>}
        </div>
      </section>

      <footer className="flex items-start gap-2 border-t border-border/70 pt-4 text-xs leading-5 text-foreground-subtle">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>个人研究工具 · 数据可能延迟或失真 · 投资决策需自行核验并承担风险</span>
      </footer>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, detail, tone }: { icon: typeof TrendingUp; label: string; value: string; detail: string; tone: "emerald" | "amber" | "blue" }) {
  const tones = { emerald: "text-accent-emerald", amber: "text-accent-amber", blue: "text-primary" };
  return <div className="rounded-lg border border-border bg-background-elevated/70 p-4"><div className="flex items-center justify-between"><span className="text-xs text-foreground-muted">{label}</span><Icon className={cn("h-4 w-4", tones[tone])} /></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-[11px] text-foreground-subtle">{detail}</div></div>;
}

function RecommendationRow({ recommendation, selected, onSelect }: { recommendation: Recommendation; selected: boolean; onSelect: () => void }) {
  const meta = signalMeta[recommendation.signal];
  const positive = recommendation.dailyChangePct >= 0;
  return <button type="button" onClick={onSelect} className={cn("grid w-full grid-cols-[minmax(0,1fr)_100px_82px] items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/50", selected && "bg-primary/[0.07]")}>
    <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{recommendation.instrument.name}</span><span className="font-mono text-[10px] text-foreground-subtle">{recommendation.instrument.symbol}</span></div><div className="mt-1 text-xs text-foreground-muted">{recommendation.instrument.kind === "fund" ? "公募基金" : "A 股"} · {recommendation.asOfDate}</div></div>
    <div className="text-right"><div className="font-mono text-sm">{recommendation.price.toFixed(recommendation.price > 100 ? 2 : 3)}</div><div className={cn("mt-1 flex items-center justify-end gap-0.5 font-mono text-[11px]", positive ? "text-accent-emerald" : "text-accent-rose")}>{positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(recommendation.dailyChangePct).toFixed(2)}%</div></div>
    <div className="text-right"><div className="font-mono text-lg font-semibold text-primary">{recommendation.score}</div><Badge variant="outline" className={cn("mt-1 text-[10px]", meta.className)}>{meta.label}</Badge></div>
  </button>;
}

function RecommendationDetail({ recommendation }: { recommendation: Recommendation }) {
  const meta = signalMeta[recommendation.signal];
  return <div className="flex h-full flex-col"><div className="border-b border-border p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-mono text-foreground-subtle">{recommendation.instrument.symbol} · {recommendation.instrument.exchange}</div><h2 className="mt-1 text-xl font-semibold">{recommendation.instrument.name}</h2></div><Badge variant="outline" className={cn("shrink-0", meta.className)}>{meta.label}</Badge></div><div className="mt-5 flex items-end justify-between"><div><div className="text-xs text-foreground-muted">综合分数</div><div className="mt-1 text-4xl font-semibold tracking-tight text-primary">{recommendation.score}<span className="ml-1 text-sm font-normal text-foreground-subtle">/ 100</span></div></div><div className="text-right"><div className="font-mono text-lg">¥{recommendation.price.toFixed(recommendation.price > 100 ? 2 : 3)}</div><div className={cn("mt-1 font-mono text-xs", recommendation.dailyChangePct >= 0 ? "text-accent-emerald" : "text-accent-rose")}>{recommendation.dailyChangePct >= 0 ? "+" : ""}{recommendation.dailyChangePct.toFixed(2)}% 今日</div></div></div></div><div className="flex-1 space-y-6 p-5"><div><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-subtle">因子拆解</h3><div className="mt-3 space-y-3">{recommendation.factors.map((factor) => <div key={factor.key}><div className="flex items-center justify-between text-xs"><span>{factor.label}</span><span className="font-mono text-foreground-muted">{factor.score} · {factor.detail}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${factor.score}%` }} /></div></div>)}</div></div><div><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-subtle">为什么是这个结论</h3><ul className="mt-3 space-y-2 text-sm text-foreground-muted">{recommendation.reasons.map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-emerald" />{reason}</li>)}</ul></div><div><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-subtle">风险提示</h3><ul className="mt-3 space-y-2 text-sm text-foreground-muted">{recommendation.risks.map((risk) => <li key={risk} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-amber" />{risk}</li>)}</ul></div></div><div className="border-t border-border px-5 py-3 text-[11px] text-foreground-subtle">数据源：{recommendation.provider} · 截止 {recommendation.asOfDate}</div></div>;
}
