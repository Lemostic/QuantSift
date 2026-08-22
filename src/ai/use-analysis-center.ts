import { useCallback, useEffect, useState } from "react";
import { configuredProvider } from "@/data/provider-registry";
import { createInvokeMarketContextProvider } from "@/data/market-context";
import { getBrowserBarCache } from "@/cache/browser-store";
import { createCachedMarketDataProvider } from "@/cache/cached-provider";
import { useAppStore } from "@/store/app-store";
import { createInvokeLlmClient } from "./llm";
import { runIntelligentScan } from "./analysis";
import { offlineWebResearchProvider } from "./research";
import { getDueIntradayScan } from "./intraday-scheduler";
import { LocalAnalysisSessionRepository } from "./session-repository";
import {
  LocalTemplateRepository,
  refineTemplateAfterScan,
  stateToTemplate,
  type TemplateState,
} from "./template-refinery";
import { DEFAULT_FACTOR_TAGS, type AnalysisSession } from "./types";

const SESSIONS_CHANGED_EVENT = "quantsift:analysis-changed";
const LAST_RUN_KEY = "quantsift.ai-last-scan.v1";

let browserRepository: LocalAnalysisSessionRepository | null = null;
let templateRepository: LocalTemplateRepository | null = null;
let scanInFlight = false;

function getTemplateRepository(): LocalTemplateRepository {
  if (templateRepository === null) {
    templateRepository = new LocalTemplateRepository(window.localStorage);
  }
  return templateRepository;
}

/** 读取当前提示词模板状态（外部 UI 也可复用）。 */
export function readTemplateState(): TemplateState {
  return getTemplateRepository().read();
}

/** 保存模板状态（偏好页手动调整后调用）。 */
export function saveTemplateState(state: TemplateState): void {
  getTemplateRepository().write(state);
}

/** 重置提示词模板到默认 v1。 */
export function resetTemplateState(): TemplateState {
  return getTemplateRepository().reset();
}

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
    const templateState = getTemplateRepository().read();
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
      factorTags: [...DEFAULT_FACTOR_TAGS, ...state.aiFactorCatalog],
      listInstruments: () => configuredProvider().listInstruments(),
      listMemory: (instrumentId) => repository.listByInstrument(instrumentId),
      marketContextProvider: createInvokeMarketContextProvider(),
      template: stateToTemplate(templateState),
      seed,
      trigger,
    });
    for (const session of result.sessions) {
      await repository.save(session);
    }
    // 模板自迭代：依据本次扫描的会话反馈精炼提示词模板并持久化
    // （版本升级或反馈评分有新增时都写入）。
    if (result.sessions.length > 0) {
      const refined = refineTemplateAfterScan(
        templateState,
        result.sessions,
        () => new Date(),
      );
      if (
        refined.appliedRefinements > 0 ||
        refined.state.scores.length > templateState.scores.length
      ) {
        getTemplateRepository().write(refined.state);
      }
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
