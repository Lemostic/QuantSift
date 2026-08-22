import { useCallback, useMemo, useState } from "react";
import {
  Brain,
  Lightning,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { Instrument } from "@/quant/types";
import {
  KEY_POINT_KIND_LABEL,
  keyPointSignalLabel,
  type KeyPoint,
} from "@/quant/key-points";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { createInvokeLlmClient } from "@/ai/llm";
import { readTemplateState } from "@/ai/use-analysis-center";
import {
  buildPointAnalysisPrompt,
  runPointAnalysis,
  type PointAnalysisResult,
} from "@/ai/point-analysis";
import {
  LocalPointAnalysisCache,
  pointAnalysisCacheKey,
} from "@/ai/point-analysis-cache";

const SIGNAL_STYLE: Record<KeyPoint["signal"], string> = {
  bullish: "text-accent-emerald border-accent-emerald/40 bg-accent-emerald/[0.06]",
  bearish: "text-accent-rose border-accent-rose/40 bg-accent-rose/[0.06]",
  neutral: "text-accent-amber border-accent-amber/40 bg-accent-amber/[0.06]",
};

function IndicatorRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value === null) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-foreground-subtle">{label}</span>
      <strong className="font-mono text-[9px] font-medium text-foreground">
        {value}
      </strong>
    </div>
  );
}

let pointCache: LocalPointAnalysisCache | null = null;
function getPointCache(): LocalPointAnalysisCache {
  if (pointCache === null) {
    pointCache = new LocalPointAnalysisCache(window.localStorage);
  }
  return pointCache;
}

/**
 * 关键点悬停分析面板：指标快照 + 规则解释 + 信号提醒，
 * 可选调用 AI 模型对这一点做深度分析（结果本地缓存）。
 */
export function KeyPointPanel({
  point,
  instrument,
  aiDeepEnabled,
  onClose,
}: {
  point: KeyPoint;
  instrument: Instrument;
  aiDeepEnabled: boolean;
  onClose: () => void;
}) {
  const providers = useAppStore((s) => s.aiProviders);
  const [aiState, setAiState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; result: PointAnalysisResult; fromCache: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const enabledProvider = useMemo(
    () => providers.find((provider) => provider.enabled && provider.apiKey),
    [providers],
  );
  const templateVersion = useMemo(() => readTemplateState().version, []);

  const runAi = useCallback(async () => {
    if (!enabledProvider) {
      setAiState({ status: "error", message: "未启用任何 AI 模型，请到偏好设置配置。" });
      return;
    }
    const cache = getPointCache();
    const cacheKey = pointAnalysisCacheKey(
      instrument.id,
      point,
      enabledProvider.id,
      enabledProvider.model,
      templateVersion,
    );
    const cached = cache.get(cacheKey);
    if (cached) {
      setAiState({ status: "done", result: parseCached(cached), fromCache: true });
      return;
    }
    setAiState({ status: "loading" });
    const messages = buildPointAnalysisPrompt({
      instrument,
      point,
      templateVersion,
    });
    const result = await runPointAnalysis(
      createInvokeLlmClient(),
      enabledProvider,
      messages,
    );
    if (!result) {
      setAiState({ status: "error", message: "AI 分析失败，请检查网络后重试。" });
      return;
    }
    cache.set(cacheKey, serializeResult(result));
    setAiState({ status: "done", result, fromCache: false });
  }, [enabledProvider, instrument, point, templateVersion]);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 w-[300px] max-w-[calc(100%-16px)] rounded-lg border border-border/70 bg-background-overlay/95 shadow-diffusion-md backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkle size={13} className="shrink-0 text-primary" />
          <span className="truncate font-mono text-[9px] font-semibold text-foreground">
            {point.tradeDate} · {KEY_POINT_KIND_LABEL[point.kind]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "rounded-full border px-1.5 py-px text-[8px]",
              SIGNAL_STYLE[point.signal],
            )}
          >
            {keyPointSignalLabel(point.signal)}
          </span>
          <span className="font-mono text-[8px] text-foreground-subtle">
            重要 {point.importance}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭分析面板"
            className="rounded p-0.5 text-foreground-subtle transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="max-h-[46vh] space-y-2.5 overflow-y-auto px-3 py-2.5">
        <p className="text-[10px] leading-4 text-foreground-muted">{point.summary}</p>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[9px]">
          <span className="text-foreground-subtle">
            开 <strong className="text-foreground">{point.open}</strong>
          </span>
          <span className="text-foreground-subtle">
            高 <strong className="text-foreground">{point.high}</strong>
          </span>
          <span className="text-foreground-subtle">
            低 <strong className="text-foreground">{point.low}</strong>
          </span>
          <span className="text-foreground-subtle">
            收 <strong className="text-foreground">{point.close}</strong>
          </span>
          <span
            className={cn(
              "font-semibold",
              point.changePct >= 0 ? "text-accent-emerald" : "text-accent-rose",
            )}
          >
            {point.changePct >= 0 ? "+" : ""}
            {point.changePct}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-border/50 bg-background/40 px-2.5 py-2">
          <IndicatorRow label="量比" value={point.indicators.volumeRatio} />
          <IndicatorRow label="MACD DIF" value={point.indicators.macdDif} />
          <IndicatorRow label="MACD 柱" value={point.indicators.macdHist} />
          <IndicatorRow label="KDJ K / D" value={kdjValue(point)} />
          <IndicatorRow label="RSI(14)" value={point.indicators.rsi} />
          <IndicatorRow label="BOLL 上轨" value={point.indicators.bollUpper} />
          <IndicatorRow label="BOLL 下轨" value={point.indicators.bollLower} />
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="rounded-full border border-border/50 px-1.5 py-px font-mono text-[8px] text-foreground-subtle">
            MA5 {fmt(point.indicators.ma5)}
          </span>
          <span className="rounded-full border border-border/50 px-1.5 py-px font-mono text-[8px] text-foreground-subtle">
            MA20 {fmt(point.indicators.ma20)}
          </span>
          <span className="rounded-full border border-border/50 px-1.5 py-px font-mono text-[8px] text-foreground-subtle">
            MA60 {fmt(point.indicators.ma60)}
          </span>
        </div>

        {aiDeepEnabled && (
          <div>
            {aiState.status === "idle" && (
              <button
                type="button"
                onClick={() => void runAi()}
                className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/[0.08] text-[10px] font-medium text-primary transition-colors hover:bg-primary/[0.14]"
              >
                <Brain size={13} />
                AI 分析此点
                {enabledProvider && (
                  <span className="font-mono text-[8px] text-foreground-subtle">
                    · {enabledProvider.label}
                  </span>
                )}
              </button>
            )}
            {aiState.status === "loading" && (
              <div className="flex h-7 items-center justify-center gap-2 rounded-md border border-border/60 text-[10px] text-foreground-muted">
                <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                AI 分析中…
              </div>
            )}
            {aiState.status === "error" && (
              <div className="flex items-start gap-1.5 rounded-md border border-accent-rose/30 bg-accent-rose/[0.04] px-2 py-1.5 text-[9px] leading-4 text-foreground-muted">
                <Warning size={12} className="mt-0.5 shrink-0 text-accent-rose" />
                {aiState.message}
              </div>
            )}
            {aiState.status === "done" && (
              <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-[9px] font-semibold text-primary">
                    <Brain size={11} />
                    AI 深度分析
                  </span>
                  <span className="font-mono text-[8px] text-foreground-subtle">
                    {aiState.result.signal.toUpperCase()} · 置信{" "}
                    {aiState.result.confidence}
                    {aiState.fromCache ? " · 缓存" : ""}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {aiState.result.reasons.slice(0, 3).map((reason, index) => (
                    <li
                      key={index}
                      className="flex gap-1.5 text-[9px] leading-4 text-foreground-muted"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      {reason}
                    </li>
                  ))}
                </ul>
                {aiState.result.risks.length > 0 && (
                  <div className="mt-1.5 border-t border-border/40 pt-1.5">
                    {aiState.result.risks.slice(0, 2).map((risk, index) => (
                      <div
                        key={index}
                        className="flex gap-1.5 text-[9px] leading-4 text-foreground-subtle"
                      >
                        <Lightning size={10} className="mt-0.5 shrink-0 text-accent-amber" />
                        {risk}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(value: number | null): string {
  return value === null ? "--" : String(value);
}

function kdjValue(point: KeyPoint): number | null {
  return point.indicators.kdjK === null ? null : Number(point.indicators.kdjK.toFixed(0));
}

function serializeResult(result: PointAnalysisResult): string {
  return JSON.stringify(result);
}

function parseCached(raw: string): PointAnalysisResult {
  try {
    const parsed = JSON.parse(raw) as PointAnalysisResult;
    if (parsed && typeof parsed.confidence === "number") return parsed;
  } catch {
    // 损坏缓存回退为空结果。
  }
  return {
    signal: "watch",
    confidence: 0,
    summary: raw,
    reasons: [],
    risks: [],
  };
}
