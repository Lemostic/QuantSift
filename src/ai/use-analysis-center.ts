import { useCallback, useEffect, useState } from "react";
import { configuredProvider } from "@/data/provider-registry";
import { getBrowserBarCache } from "@/cache/browser-store";
import { createCachedMarketDataProvider } from "@/cache/cached-provider";
import { useAppStore } from "@/store/app-store";
import { createInvokeLlmClient } from "./llm";
import { runIntelligentScan } from "./analysis";
import { offlineWebResearchProvider } from "./research";
import { getDueIntradayScan } from "./intraday-scheduler";
import { LocalAnalysisSessionRepository } from "./session-repository";
import { DEFAULT_FACTOR_TAGS, type AnalysisSession } from "./types";

const SESSIONS_CHANGED_EVENT = "quantsift:analysis-changed";
const LAST_RUN_KEY = "quantsift.ai-last-scan.v1";

let browserRepository: LocalAnalysisSessionRepository | null = null;
let scanInFlight = false;

function getRepository(): LocalAnalysisSessionRepository {
  if (browserRepository === null) {
    browserRepository = new LocalAnalysisSessionRepository(window.localStorage);
  }
  return browserRepository;
}

function announceChange() {
  window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT));
}

function readLastRun(): Date | null {
  try {
    const raw = window.localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { slotAt?: string };
    return parsed.slotAt ? new Date(parsed.slotAt) : null;
  } catch {
    return null;
  }
}

function writeLastRun(slotAt: string) {
  window.localStorage.setItem(LAST_RUN_KEY, JSON.stringify({ slotAt }));
}

/**
 * 研究简报始终使用本地离线样本（确定性、无外部依赖）；分析结论由配置的
 * AI 模型给出。如需接入外部搜索源，在 `WebResearchProvider` 接缝处扩展。
 */
const researchProvider = offlineWebResearchProvider;

/**
 * 执行一次智能分析扫描（手动/定时触发）：对参与标的并行调用启用模型，
 * 生成会话并留存。返回新会话与错误列表。
 */
export async function executeIntelligentScan(
  instrumentIds: string[],
  trigger: "manual" | "scheduled",
  seed?: number,
): Promise<{ sessions: AnalysisSession[]; errors: string[] }> {
  if (scanInFlight) return { sessions: [], errors: ["扫描正在进行中"] };
  scanInFlight = true;
  try {
    const state = useAppStore.getState();
    const enabledProviders = state.aiProviders.filter(
      (provider) => provider.enabled && provider.apiKey.trim().length > 0,
    );
    const repository = getRepository();
    const result = await runIntelligentScan({
      provider: createCachedMarketDataProvider(
        configuredProvider(),
        getBrowserBarCache(),
      ),
      instrumentIds,
      llmProviders: enabledProviders,
      llm: createInvokeLlmClient(),
      researchProvider,
      factorConfig: state.aiFactorConfig,
      factorTags: DEFAULT_FACTOR_TAGS,
      listInstruments: () => configuredProvider().listInstruments(),
      listMemory: (instrumentId) => repository.listByInstrument(instrumentId),
      seed,
      trigger,
    });
    for (const session of result.sessions) {
      await repository.save(session);
    }
    announceChange();
    return result;
  } finally {
    scanInFlight = false;
  }
}

export function useAnalysisCenter() {
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSessions(await getRepository().list());
      setRunning(scanInFlight);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const handleChange = () => void reload();
    window.addEventListener(SESSIONS_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(SESSIONS_CHANGED_EVENT, handleChange);
  }, [reload]);

  const runNow = useCallback(
    async (instrumentIds: string[], seed?: number) => {
      setRunning(true);
      setError(null);
      try {
        const result = await executeIntelligentScan(instrumentIds, "manual", seed);
        if (result.errors.length > 0) {
          setError(result.errors.join("；"));
        }
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
      }
    },
    [reload],
  );

  return { sessions, running, ready, error, runNow, reload };
}

/**
 * 交易时段定时智能扫描：窗口内按间隔触发一次；同日同槽不重复。
 */
export function useIntelligentAutoScan(instrumentIds: string[]) {
  const instrumentIdsKey = instrumentIds.join("|");

  useEffect(() => {
    let disposed = false;

    const tick = async () => {
      if (disposed || scanInFlight || instrumentIds.length === 0) return;
      const schedule = useAppStore.getState().aiIntradaySchedule;
      const now = new Date();
      const due = getDueIntradayScan(schedule, now, readLastRun());
      if (!due) return;
      writeLastRun(due.slotAt);
      announceChange();
      try {
        await executeIntelligentScan(instrumentIds, "scheduled");
      } catch {
        // 失败不阻塞下一轮；错误会经 useAnalysisCenter 展示。
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [instrumentIdsKey]);
}
