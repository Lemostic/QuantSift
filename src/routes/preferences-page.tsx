import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowCounterClockwise,
  ArrowsHorizontal,
  ArrowsVertical,
  Brain,
  Check,
  ClockCountdown,
  Database,
  Eraser,
  HardDrives,
  Key,
  Palette,
  Plus,
  Robot,
  Shuffle,
  SlidersHorizontal,
  Sparkle,
  Trash,
  WifiHigh,
  Warning,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  PADDING_MAX,
  PADDING_MIN,
  PADDING_PRESETS,
  PADDING_STEP,
  PAGE_CONTAINER_CLASS,
  clampPadding,
  isUniformPadding,
  paddingToStyle,
  type PagePadding,
} from "@/lib/spacing";
import {
  checkAllSources,
  getSourceStatus,
  type SourceStatus,
} from "@/data/source-check";
import {
  LIVE_SOURCE_META,
  type DataSourceId,
} from "@/data/provider-registry";
import { getBrowserBarCache } from "@/cache/browser-store";
import { cacheStats } from "@/cache/service";
import type { CacheStats } from "@/cache/service";
import {
  DEFAULT_FACTOR_TAGS,
  type FactorConfig,
  type IntradaySchedule,
  type LlmProviderConfig,
} from "@/ai/types";
import {
  LLM_PROVIDER_PRESETS,
  presetById,
} from "@/ai/provider-presets";
import { refreshFactorCatalogWithAI } from "@/ai/factor-refresh";
import { ensureFactorTagSettings } from "@/ai/factors";
import { createInvokeLlmClient } from "@/ai/llm";
import {
  readTemplateState,
  resetTemplateState,
  saveTemplateState,
} from "@/ai/use-analysis-center";
import { LocalPointAnalysisCache } from "@/ai/point-analysis-cache";
import type { TemplateParams } from "@/ai/types";

export function PreferencesPage() {
  const contentPadding = useAppStore((s) => s.contentPadding);
  const theme = useAppStore((s) => s.theme);
  const setContentPadding = useAppStore((s) => s.setContentPadding);
  const resetContentPadding = useAppStore((s) => s.resetContentPadding);
  const setTheme = useAppStore((s) => s.setTheme);
  const recentModules = useAppStore((s) => s.recentModules);
  const marketDataSource = useAppStore((s) => s.marketDataSource);
  const allowOfflineFallback = useAppStore((s) => s.allowOfflineFallback);
  const setMarketDataSource = useAppStore((s) => s.setMarketDataSource);
  const setAllowOfflineFallback = useAppStore(
    (s) => s.setAllowOfflineFallback,
  );
  const aiProviders = useAppStore((s) => s.aiProviders);
  const setAiProviders = useAppStore((s) => s.setAiProviders);
  const aiFactorConfig = useAppStore((s) => s.aiFactorConfig);
  const setAiFactorConfig = useAppStore((s) => s.setAiFactorConfig);
  const aiIntradaySchedule = useAppStore((s) => s.aiIntradaySchedule);
  const setAiIntradaySchedule = useAppStore((s) => s.setAiIntradaySchedule);

  return (
    <div
      className={cn(PAGE_CONTAINER_CLASS, "h-auto min-h-full gap-5 max-sm:!px-4 max-sm:!py-4")}
      style={paddingToStyle(contentPadding)}
    >
      <header className="border-b border-border/70 pb-4">
        <div className="font-mono text-[9px] font-semibold text-primary">
          SYSTEM / PREFERENCES
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">偏好设置</h1>
          <p className="text-[11px] text-foreground-muted sm:text-xs">
            调整研究界面的密度、主题与本地显示习惯
          </p>
        </div>
      </header>

      {/* Live preview — visualises the current vertical/horizontal padding */}
      <SettingsGroup
        title="市场数据"
        description="选择全局行情提供商。首页、观察列表、持仓、扫描和 K 线会使用同一配置。"
        icon={<Database className="h-4 w-4" />}
      >
        <MarketDataSettings
          source={marketDataSource}
          allowFallback={allowOfflineFallback}
          onSourceChange={setMarketDataSource}
          onFallbackChange={setAllowOfflineFallback}
        />
      </SettingsGroup>

      <BarCacheSettings />

      <LlmProviderSettings providers={aiProviders} onChange={setAiProviders} />

      <AiFactorSettings
        config={aiFactorConfig}
        onChange={setAiFactorConfig}
      />

      <AiScheduleSettings
        schedule={aiIntradaySchedule}
        onChange={setAiIntradaySchedule}
      />

      <TemplateSettings />

      <KeyPointSettings />

      <PaddingPreview value={contentPadding} />

      {/* Preset row + per-axis sliders */}
      <SettingsGroup
        title="内容边距"
        description="分别控制主区域上下边距和左右边距。上下保持一致、左右保持一致。值越大阅读越舒适；值越小每屏能展示更多内容。点击预设可一键填入，或拖动滑块微调。"
        icon={<SlidersHorizontal className="h-4 w-4" />}
      >
        <PaddingEditor value={contentPadding} onChange={setContentPadding} />
      </SettingsGroup>

      {/* Theme */}
      <SettingsGroup
        title="主题"
        description="应用整体配色方案。暗色是 Velora 的默认。"
        icon={<Palette className="h-4 w-4" />}
      >
        <div className="grid grid-cols-3 gap-2">
          {(["dark", "light", "system"] as const).map((t) => {
            const active = t === theme;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "rounded-lg border p-3 text-sm font-medium tracking-tight transition-all",
                  active
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                {t === "dark" ? "暗色" : t === "light" ? "亮色" : "跟随系统"}
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      {/* Recent modules */}
      <SettingsGroup
        title="最近使用"
        description="按访问顺序排列，最多 8 个。"
        icon={<Sparkle className="h-4 w-4" />}
      >
        {recentModules.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/30 p-6 text-center text-sm text-muted-foreground">
            还没有访问过模块。打开任意模块后会出现在这里。
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {recentModules.map((id) => (
              <span
                key={id}
                className="rounded-full border border-border/60 bg-background/40 px-2.5 py-0.5 font-mono text-[11px] tracking-tight text-muted-foreground"
              >
                {id}
              </span>
            ))}
          </div>
        )}
      </SettingsGroup>

      {/* Reset */}
      <div className="flex items-center justify-end gap-2">
        {!isUniformPadding(contentPadding) && (
          <span className="text-[11px] text-muted-foreground">
            上下 ≠ 左右 — 预设不会高亮
          </span>
        )}
        <ResetButton onReset={resetContentPadding} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------------

function LlmProviderSettings({
  providers,
  onChange,
}: {
  providers: LlmProviderConfig[];
  onChange: (providers: LlmProviderConfig[]) => void;
}) {
  const [presetId, setPresetId] = useState("deepseek");

  const update = (index: number, patch: Partial<LlmProviderConfig>) => {
    onChange(
      providers.map((provider, i) => (i === index ? { ...provider, ...patch } : provider)),
    );
  };

  const addProvider = () => {
    const preset = presetById(presetId);
    if (!preset) return;
    onChange([
      ...providers,
      {
        id: `model-${Date.now().toString(36)}`,
        label: preset.label,
        baseUrl: preset.baseUrl,
        apiKey: "",
        model: preset.model,
        enabled: false,
        isDefault: providers.length === 0,
      },
    ]);
  };

  const removeProvider = (index: number) => {
    onChange(providers.filter((_, i) => i !== index));
  };

  return (
    <SettingsGroup
      title="AI 分析模型"
      description="分析结论完全由这些模型给出（DeepSeek、MiniMax、通义、Kimi、OpenAI 等，均走 OpenAI 兼容接口）。选择预设一键填入，粘贴自己的 API Key 并启用即可；多个模型会并行分析后取共识。密钥仅保存在本机，界面掩码显示。"
      icon={<Robot className="h-4 w-4" />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={presetId}
          onChange={(event) => setPresetId(event.target.value)}
          aria-label="选择模型预设"
          className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs focus:border-primary/50 focus:outline-none"
        >
          {LLM_PROVIDER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
              {preset.region ? `（${preset.region}）` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addProvider}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent"
        >
          <Plus size={14} />
          添加模型
        </button>
        <span className="font-mono text-[9px] text-foreground-subtle">
          {providers.length} 个已配置
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {providers.map((provider, index) => (
          <div
            key={provider.id}
            className="rounded-lg border border-border/60 bg-background/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) => update(index, { enabled: event.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                  aria-label={`启用 ${provider.label}`}
                />
                <input
                  value={provider.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  className="w-28 rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:border-primary/50 focus:outline-none"
                  aria-label="模型名称"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => removeProvider(index)}
                  className="grid h-7 w-7 place-items-center text-foreground-subtle transition-colors hover:text-accent-rose"
                  aria-label={`删除 ${provider.label}`}
                >
                  <Trash size={14} />
                </button>
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field
                label="Base URL"
                value={provider.baseUrl}
                onChange={(value) => update(index, { baseUrl: value })}
              />
              <Field
                label="Model"
                value={provider.model}
                onChange={(value) => update(index, { model: value })}
              />
            </div>
            <div className="mt-2">
              <label className="block text-[10px] text-foreground-subtle">
                API Key（本地保存，掩码显示）
              </label>
              <div className="relative mt-1">
                <Key size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-foreground-subtle" />
                <input
                  type="password"
                  value={provider.apiKey}
                  onChange={(event) => update(index, { apiKey: event.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-md border border-border/60 bg-background py-1.5 pl-7 pr-2 font-mono text-xs focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SettingsGroup>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-foreground-subtle">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs focus:border-primary/50 focus:outline-none"
      />
    </label>
  );
}

function AiFactorSettings({
  config,
  onChange,
}: {
  config: FactorConfig;
  onChange: (config: FactorConfig) => void;
}) {
  const aiFactorCatalog = useAppStore((s) => s.aiFactorCatalog);
  const setAiFactorCatalog = useAppStore((s) => s.setAiFactorCatalog);
  const aiProviders = useAppStore((s) => s.aiProviders);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const builtIn = DEFAULT_FACTOR_TAGS;
    const extra = aiFactorCatalog.filter(
      (tag) => !builtIn.some((candidate) => candidate.id === tag.id),
    );
    return [...builtIn, ...extra];
  }, [aiFactorCatalog]);

  const toggle = (tagId: string) => {
    const existing = config.tags.find((setting) => setting.tagId === tagId);
    if (existing) {
      // 已有设置：翻转开关。
      onChange({
        ...config,
        tags: config.tags.map((setting) =>
          setting.tagId === tagId
            ? { ...setting, enabled: !setting.enabled }
            : setting,
        ),
      });
    } else {
      // 目录里有但配置数组缺失（AI 新增等）：补齐并默认启用。
      onChange({
        ...config,
        tags: [...config.tags, { tagId, enabled: true }],
      });
    }
  };

  const refreshWithAI = async () => {
    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const enabledProviders = aiProviders.filter(
        (provider) => provider.enabled && provider.apiKey.trim().length > 0,
      );
      const result = await refreshFactorCatalogWithAI({
        providers: enabledProviders,
        llm: createInvokeLlmClient(),
        currentTags: allTags,
        enabledTagIds: config.tags
          .filter((setting) => setting.enabled)
          .map((setting) => setting.tagId),
      });
      // 只留存内置之外的 AI 新增因子。
      const builtInIds = new Set(DEFAULT_FACTOR_TAGS.map((tag) => tag.id));
      setAiFactorCatalog(result.tags.filter((tag) => !builtInIds.has(tag.id)));
      // 同步补齐启用设置：AI 新增因子默认激活，避免"看得见却选不了"。
      onChange(ensureFactorTagSettings(config, result.tags));
      if (result.added.length > 0) {
        setRefreshNotice(
          `已新增 ${result.added.length} 个因子：${result.added.map((tag) => tag.label).join("、")}`,
        );
      } else {
        setRefreshNotice("模型未给出新的因子建议，目录保持不变。");
      }
      if (result.errors.length > 0) {
        setRefreshNotice(`${refreshNotice ?? ""}（部分模型失败：${result.errors.join("；")}）`);
      }
    } catch (cause) {
      setRefreshNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SettingsGroup
      title="随机因子"
      description="每次智能扫描会基于种子为启用的因子生成随机强调角度（偏多/偏空/中性），覆盖全球市场、国内市场与政策面等维度；种子随会话留存，可复现。随机度 0 表示不使用随机波动。可用 AI 模型评审并增量更新因子目录，保持权威性。"
      icon={<Brain className="h-4 w-4" />}
    >
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const enabled =
            config.tags.find((setting) => setting.tagId === tag.id)?.enabled ??
            false;
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={enabled}
              title={tag.description}
              onClick={() => toggle(tag.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                enabled
                  ? "border-primary/40 bg-primary/[0.08] text-primary"
                  : "border-border/60 text-foreground-muted hover:border-border",
              )}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="min-h-4 text-[11px]">
          {refreshNotice && (
            <span
              className={cn(
                "flex items-center gap-1.5",
                refreshNotice.includes("已新增")
                  ? "text-accent-emerald"
                  : "text-foreground-muted",
              )}
            >
              {refreshNotice}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void refreshWithAI()}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Sparkle size={14} className={cn(refreshing && "animate-pulse")} />
          {refreshing ? "AI 评审中" : "AI 更新因子"}
        </button>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground-subtle">随机强调强度</span>
          <span className="font-mono text-[10px] text-foreground-muted">
            {config.randomness}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={config.randomness}
          onChange={(event) =>
            onChange({ ...config, randomness: Number(event.target.value) })
          }
          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-border/60 accent-primary"
        />
      </div>
    </SettingsGroup>
  );
}

function AiScheduleSettings({
  schedule,
  onChange,
}: {
  schedule: IntradaySchedule;
  onChange: (schedule: IntradaySchedule) => void;
}) {
  const timeLabel = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return (
    <SettingsGroup
      title="智能扫描（交易时段）"
      description="在 A 股交易时段内按设定间隔自动对“参与智能分析”的标的执行 AI 推荐扫描并留存会话。仅工作日触发，同一时间槽只执行一次。"
      icon={<ClockCountdown className="h-4 w-4" />}
    >
      <label className="flex items-center justify-between gap-4 border-y border-border/60 py-3">
        <span>
          <span className="block text-xs font-medium">启用定时智能扫描</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            关闭后仅手动触发。
          </span>
        </span>
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(event) =>
            onChange({ ...schedule, enabled: event.target.checked })
          }
          className="h-4 w-4 shrink-0 accent-primary"
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[10px] text-foreground-subtle">间隔（分钟）</span>
          <select
            value={schedule.intervalMinutes}
            onChange={(event) =>
              onChange({
                ...schedule,
                intervalMinutes: Number(event.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs focus:border-primary/50 focus:outline-none"
          >
            {[5, 10, 15, 30, 60].map((value) => (
              <option key={value} value={value}>
                每 {value} 分钟
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-foreground-subtle">开始时间</span>
          <input
            type="time"
            value={timeLabel(schedule.startMinutes)}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(":").map(Number);
              onChange({
                ...schedule,
                startMinutes: hour * 60 + minute,
              });
            }}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs focus:border-primary/50 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-foreground-subtle">结束时间</span>
          <input
            type="time"
            value={timeLabel(schedule.endMinutes)}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(":").map(Number);
              onChange({
                ...schedule,
                endMinutes: hour * 60 + minute,
              });
            }}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs focus:border-primary/50 focus:outline-none"
          />
        </label>
      </div>
      <p className="mt-2 font-mono text-[9px] text-foreground-subtle">
        {timeLabel(schedule.startMinutes)}–{timeLabel(schedule.endMinutes)} · 每{" "}
        {schedule.intervalMinutes} 分钟 · 工作日
      </p>
    </SettingsGroup>
  );
}

function BarCacheSettings() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setStats(cacheStats(await getBrowserBarCache().listStates()));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const clearCache = async () => {
    setClearing(true);
    setNotice(null);
    try {
      await getBrowserBarCache().clear();
      await reload();
      setNotice("本地行情缓存已清空，下次刷新会重新抓取。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setClearing(false);
    }
  };

  const formatFetchTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--";

  return (
    <SettingsGroup
      title="本地行情缓存"
      description="研究台会把每次抓取的日线写入本地缓存：启动时先展示缓存结果，再增量刷新最新行情；实时源不可用时缓存仍可离线查看。清除后所有标的的本地 K 线会重新抓取。"
      icon={<HardDrives className="h-4 w-4" />}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <CacheStatItem label="缓存标的" value={String(stats?.instruments ?? "--")} />
        <CacheStatItem label="缓存 K 线" value={String(stats?.bars ?? "--")} />
        <CacheStatItem
          label="最新行情日期"
          value={stats?.latestTradeDate ?? "--"}
          mono
        />
        <CacheStatItem
          label="最近抓取"
          value={formatFetchTime(stats?.lastFetchedAt ?? null)}
          mono
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="min-h-4 text-[11px]">
          {notice && (
            <span
              className={cn(
                "flex items-center gap-1.5",
                notice.includes("已清空")
                  ? "text-accent-emerald"
                  : "text-accent-rose",
              )}
            >
              {notice.includes("已清空") ? (
                <Check size={13} />
              ) : (
                <Warning size={13} />
              )}
              {notice}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void clearCache()}
          disabled={clearing || (stats?.instruments ?? 0) === 0}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:border-destructive/40 hover:bg-destructive/[0.06] hover:text-destructive disabled:opacity-50"
        >
          <Eraser size={14} />
          {clearing ? "清空中" : "清除缓存"}
        </button>
      </div>
    </SettingsGroup>
  );
}

function CacheStatItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-semibold",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MarketDataSettings({
  source,
  allowFallback,
  onSourceChange,
  onFallbackChange,
}: {
  source: DataSourceId;
  allowFallback: boolean;
  onSourceChange: (source: DataSourceId) => void;
  onFallbackChange: (allow: boolean) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  /** 进入偏好页自动检测（Rust 侧 5 分钟缓存，不会频繁请求端点）。 */
  useEffect(() => {
    let cancelled = false;
    void getSourceStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setCheckError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runHealthCheck = async () => {
    setTesting(true);
    setCheckError(null);
    try {
      setStatus({ cachedAt: new Date().toISOString(), summary: "重新检测中…", checks: [] });
      const checks = await checkAllSources();
      const klineOk = checks.filter((check) => check.kind === "kline" && check.ok).length;
      setStatus({
        cachedAt: new Date().toISOString(),
        summary: `${checks.filter((check) => check.ok).length}/${checks.length} 数据源可用（K 线源 ${klineOk}/3）`,
        checks,
      });
    } catch (cause) {
      setCheckError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTesting(false);
    }
  };

  const checks = status?.checks ?? null;
  const klineOk = checks?.filter((check) => check.kind === "kline" && check.ok).length ?? 0;
  // 选中源是否被体检判定为可用（auto 只要有任一 K 线源可用即可）
  const selectedUnavailable =
    source !== "recorded" &&
    checks !== null &&
    checks.length > 0 &&
    source === "auto"
      ? klineOk === 0
      : checks?.find((check) => check.id === source)?.ok === false;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.values(LIVE_SOURCE_META) as Array<(typeof LIVE_SOURCE_META)["auto"]>).map(
          (meta) => (
            <ProviderOption
              key={meta.id}
              active={source === meta.id}
              warning={false}
              icon={
                meta.id === "auto" ? (
                  <Shuffle size={18} className="text-primary" />
                ) : (
                  <WifiHigh size={18} className="text-primary" />
                )
              }
              title={meta.label}
              detail={meta.detail}
              onClick={() => {
                onSourceChange(meta.id);
                setCheckError(null);
              }}
            />
          ),
        )}
        <ProviderOption
          active={source === "recorded"}
          warning
          icon={<Database size={18} className="text-accent-amber" />}
          title="离线样本"
          detail="固定录制数据，仅用于演示和测试，不代表当前市场行情。"
          onClick={() => {
            onSourceChange("recorded");
            setCheckError(null);
          }}
        />
      </div>

      <label
        className={cn(
          "flex items-center justify-between gap-4 border-y border-border/60 py-3",
          source === "recorded" && "opacity-50",
        )}
      >
        <span>
          <span className="block text-xs font-medium">全部实时源失败时使用离线样本</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            关闭后会直接显示连接错误，避免把样本数据误认为实时行情。
          </span>
        </span>
        <input
          type="checkbox"
          checked={allowFallback}
          disabled={source === "recorded"}
          onChange={(event) => onFallbackChange(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-primary"
        />
      </label>

      {selectedUnavailable && (
        <div className="flex items-start gap-2.5 border-l-2 border-accent-amber bg-accent-amber/[0.05] px-3 py-2.5">
          <Warning size={15} className="mt-0.5 shrink-0 text-accent-amber" />
          <p className="text-[11px] leading-4 text-foreground-muted">
            当前选中的数据源在最近的连通性检测中不可用；可切换到「智能回退」让应用自动选择可用源。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-4 text-[11px]">
          {checkError && (
            <span className="flex items-center gap-1.5 text-accent-rose">
              <Warning size={13} />
              {checkError}
            </span>
          )}
          {status && !checkError && checks && checks.length > 0 && (
            <span className="flex items-center gap-1.5 text-foreground-muted">
              <Check size={13} className="text-accent-emerald" />
              {status.summary}
              <span className="font-mono text-[9px] text-foreground-subtle">
                · {status.cachedAt.slice(0, 16).replace("T", " ")}
              </span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runHealthCheck()}
          disabled={testing || source === "recorded"}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <WifiHigh size={14} />
          {testing ? "检测中…" : "重新检测连通性"}
        </button>
      </div>

      {checks && checks.length > 0 && (
        <div className="divide-y divide-border/50 overflow-hidden rounded-md border border-border/60">
          {checks.map((check) => (
            <div key={check.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    check.ok ? "bg-accent-emerald" : "bg-accent-rose",
                  )}
                />
                <span className="truncate text-[11px] font-medium">{check.label}</span>
                <span className="shrink-0 font-mono text-[8px] uppercase text-foreground-subtle">
                  {check.kind}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 truncate pl-2 font-mono text-[9px]",
                  check.ok ? "text-accent-emerald" : "text-accent-rose",
                )}
              >
                {check.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderOption({
  active,
  warning = false,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  warning?: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition-colors",
        active
          ? warning
            ? "border-accent-amber/50 bg-accent-amber/[0.05]"
            : "border-primary/50 bg-primary/[0.06]"
          : "border-border/60 bg-background/35 hover:border-border",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}

function KeyPointSettings() {
  const setting = useAppStore((s) => s.chartKeyPointAnalysis);
  const setSetting = useAppStore((s) => s.setChartKeyPointAnalysis);
  const [cacheCount, setCacheCount] = useState(0);

  useEffect(() => {
    try {
      const cache = new LocalPointAnalysisCache(window.localStorage);
      setCacheCount(cache.count());
    } catch {
      setCacheCount(0);
    }
  }, []);

  const clearCache = () => {
    const cache = new LocalPointAnalysisCache(window.localStorage);
    cache.clear();
    setCacheCount(0);
  };

  const toggle = (key: "enabled" | "aiDeep") => {
    setSetting({ ...setting, [key]: !setting[key] });
  };

  return (
    <SettingsGroup
      title="K 线关键点分析"
      description="加载行情时用本地规则识别关键点（放量突破、金叉/死叉、趋势反转、支撑/压力测试等），在 K 线图上打标记；鼠标悬停标记可查看该点全部指标快照、规则解释与信号提醒。AI 深度分析按点调用模型，结果本地缓存，不重复消耗。"
      icon={<Sparkle className="h-4 w-4" />}
    >
      <label className="flex items-center justify-between gap-4 border-b border-border/60 py-3">
        <span>
          <span className="block text-xs font-medium">启用关键点识别与悬停分析</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            关闭后图表不再绘制关键点标记，悬停只显示常规十字光标读数。
          </span>
        </span>
        <input
          type="checkbox"
          checked={setting.enabled}
          onChange={() => toggle("enabled")}
          className="h-4 w-4 shrink-0 accent-primary"
        />
      </label>

      <label className="flex items-center justify-between gap-4 border-b border-border/60 py-3">
        <span>
          <span className="block text-xs font-medium">允许 AI 深度分析（按点调用模型）</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            悬停面板显示「AI 分析此点」按钮；同一标的同一日期只计费一次，结果缓存 30 天。
          </span>
        </span>
        <input
          type="checkbox"
          checked={setting.aiDeep}
          disabled={!setting.enabled}
          onChange={() => toggle("aiDeep")}
          className="h-4 w-4 shrink-0 accent-primary"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[9px] text-foreground-subtle">
          <HardDrives size={13} />
          已缓存 {cacheCount} 条 AI 点分析结果
        </div>
        <button
          type="button"
          onClick={clearCache}
          disabled={cacheCount === 0}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Eraser size={14} />
          清空缓存
        </button>
      </div>
    </SettingsGroup>
  );
}

function TemplateSettings() {
  const [state, setState] = useState(() => readTemplateState());
  const [saved, setSaved] = useState(false);

  const updateParams = (delta: Partial<TemplateParams>) => {
    setState((s) => ({ ...s, params: { ...s.params, ...delta } }));
    setSaved(false);
  };

  const save = () => {
    saveTemplateState(state);
    setSaved(true);
  };

  const reset = () => {
    const next = resetTemplateState();
    setState(next);
    setSaved(true);
  };

  const paramRow = (
    label: string,
    key: keyof TemplateParams,
    min: number,
    max: number,
    hint: string,
  ) => (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-3 py-2">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-tight text-foreground/80">
            {label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {state.params[key]}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={5}
          value={state.params[key]}
          onChange={(e) => updateParams({ [key]: Number(e.target.value) } as Partial<TemplateParams>)}
          className="h-1.5 w-full cursor-pointer accent-primary"
        />
        <span className="text-[9px] text-muted-foreground/60">{hint}</span>
      </div>
    </div>
  );

  return (
    <SettingsGroup
      title="AI 提示词模板（自迭代）"
      description="每次智能分析完成后，系统按反馈（格式合规、置信度校准、风险提示、模型共识）自动评分并小幅优化模板参数，版本递增、变更可查；也可在此手动微调后保存。"
      icon={<SlidersHorizontal className="h-4 w-4" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-primary/40 bg-primary/[0.07] px-2 py-1 font-mono text-[10px] text-primary">
            v{state.version}
          </span>
          <span className="font-mono text-[9px] text-foreground-subtle">
            {state.changelog.length > 0
              ? `最近优化：${state.changelog[0].appliedAt.slice(0, 10)} · ${state.changelog.length} 次变更`
              : "尚无自动优化记录"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-[10px] text-accent-emerald">
              <Check size={12} />
              已保存
            </span>
          )}
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-foreground-muted transition-colors hover:bg-accent"
          >
            <ArrowCounterClockwise size={13} />
            重置为默认
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/[0.08] px-3 text-[11px] font-medium text-primary transition-colors hover:bg-primary/[0.14]"
          >
            <Check size={13} />
            保存参数
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {paramRow("输出格式严格度", "strictness", 10, 100, "越高越强制五段式输出，缺失即扣分")}
        {paramRow("风险关注强度", "riskFocus", 10, 100, "越高要求越多且具体的风险提示")}
        {paramRow("市场校准权重", "calibrationWeight", 10, 100, "越高越重视全球/A 股环境对结论的约束")}
        {paramRow("篇幅控制", "verbosity", 10, 90, "越低输出越简洁（200 字级）")}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-foreground/80">推理深度</span>
        {(["concise", "standard", "detailed"] as const).map((depth) => (
          <button
            key={depth}
            type="button"
            onClick={() => updateParams({ reasoningDepth: depth })}
            className={cn(
              "h-7 rounded-md border px-3 font-mono text-[10px] transition-colors",
              state.params.reasoningDepth === depth
                ? "border-primary/50 bg-primary/[0.08] text-primary"
                : "border-border/60 text-foreground-muted hover:text-foreground",
            )}
          >
            {depth === "concise" ? "简洁" : depth === "standard" ? "标准" : "详细"}
          </button>
        ))}
      </div>

      {state.changelog.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold text-foreground-muted">
            最近变更（近 {Math.min(state.changelog.length, 6)} 条）
          </div>
          <div className="divide-y divide-border/50 overflow-hidden rounded-md border border-border/60">
            {state.changelog.slice(0, 6).map((entry) => (
              <div key={entry.version} className="flex items-start gap-3 px-3 py-2">
                <span className="mt-0.5 shrink-0 font-mono text-[9px] text-primary">
                  v{entry.version}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] leading-4 text-foreground-muted">{entry.reason}</p>
                  <p className="mt-0.5 font-mono text-[8px] text-foreground-subtle">
                    {entry.appliedAt.replace("T", " ").slice(0, 16)} ·{" "}
                    {Object.entries(entry.delta)
                      .map(([key, value]) => `${key}→${value}`)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.scores.length > 0 && (
        <p className="font-mono text-[9px] text-foreground-subtle">
          最近 {Math.min(state.scores.length, 5)} 次反馈评分：{" "}
          {state.scores
            .slice(-5)
            .map((entry) => `${entry.version}:${entry.score}`)
            .join(" · ")}
        </p>
      )}
    </SettingsGroup>
  );
}

function PaddingPreview({ value }: { value: PagePadding }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card/30 shadow-diffusion-sm">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          实时预览
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          上下 {value.vertical}px · 左右 {value.horizontal}px
        </span>
      </div>
      <div className="bg-[radial-gradient(oklch(0.27_0_0/0.3)_1px,transparent_1px)] [background-size:12px_12px] p-4">
        <div
          className="mx-auto h-48 max-w-md rounded-lg border border-dashed border-border/60 bg-background/30 transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={paddingToStyle(value)}
        >
          <div className="h-full rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] p-3">
            <div className="space-y-1.5">
              <div className="h-2 w-1/3 rounded-full bg-foreground/30" />
              <div className="h-1.5 w-2/3 rounded-full bg-foreground/15" />
              <div className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <div className="h-3 rounded bg-foreground/10" />
                <div className="h-3 rounded bg-foreground/10" />
                <div className="h-3 rounded bg-foreground/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset row + per-axis editor
// ---------------------------------------------------------------------------

function PaddingEditor({
  value,
  onChange,
}: {
  value: PagePadding;
  onChange: (next: PagePadding) => void;
}) {
  const update = (patch: Partial<PagePadding>) =>
    onChange(clampPadding({ ...value, ...patch }));

  return (
    <div className="flex flex-col gap-5">
      {/* Preset row — highlighted only when both axes match a preset */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PADDING_PRESETS.map((preset) => {
          const active =
            value.vertical === preset.padding.vertical &&
            value.horizontal === preset.padding.horizontal;
          return (
            <button
              key={preset.label}
              onClick={() => onChange({ ...preset.padding })}
              className={cn(
                "group relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
                active
                  ? "border-primary/50 bg-primary/[0.06]"
                  : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "text-sm font-medium tracking-tight",
                    active ? "text-foreground" : "text-foreground/80",
                  )}
                >
                  {preset.label}
                </span>
                {active && (
                  <motion.span
                    layoutId="padding-preset-active"
                    className="grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground"
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  >
                    <Check className="h-2.5 w-2.5" weight="bold" />
                  </motion.span>
                )}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/60" />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
          单独调整
        </span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      {/* Two-axis sliders + number inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AxisControl
          label="上下边距"
          axis="vertical"
          icon={<ArrowsVertical size={14} />}
          value={value.vertical}
          onChange={(v) => update({ vertical: v })}
        />
        <AxisControl
          label="左右边距"
          axis="horizontal"
          icon={<ArrowsHorizontal size={14} />}
          value={value.horizontal}
          onChange={(v) => update({ horizontal: v })}
        />
      </div>

      {/* Range hint */}
      <p className="font-mono text-[10px] text-muted-foreground/60">
        范围 {PADDING_MIN}–{PADDING_MAX}px · 步长 {PADDING_STEP}px
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Axis control — slider + number input with a visual indicator
// ---------------------------------------------------------------------------

interface AxisControlProps {
  label: string;
  axis: "vertical" | "horizontal";
  icon: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
}

function AxisControl({ label, icon, value, onChange }: AxisControlProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-3 py-2.5 shadow-diffusion-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 bg-background/40 text-primary">
        {icon}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-tight text-foreground/80">
            {label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {value}px
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={PADDING_MIN}
            max={PADDING_MAX}
            step={PADDING_STEP}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className={cn(
              "h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border/60 accent-primary",
              "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5",
              "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-primary",
              "[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0",
            )}
          />
          <input
            type="number"
            min={PADDING_MIN}
            max={PADDING_MAX}
            step={PADDING_STEP}
            value={value}
            onChange={(e) => onChange(Number(e.target.value || 0))}
            onBlur={(e) => {
              const n = Number(e.target.value || 0);
              const clamped = Math.min(
                PADDING_MAX,
                Math.max(PADDING_MIN, Math.round(n / PADDING_STEP) * PADDING_STEP),
              );
              if (clamped !== value) onChange(clamped);
            }}
            className={cn(
              "w-16 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-right",
              "font-mono text-[12px] tabular-nums text-foreground",
              "focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30",
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reused bits
// ---------------------------------------------------------------------------

function SettingsGroup({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card/30 p-5 shadow-diffusion-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/40 text-foreground/80">
          {icon}
        </div>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      className="group flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/[0.06] hover:text-destructive"
    >
      <ArrowCounterClockwise className="h-3 w-3 transition-transform group-hover:-rotate-45" />
      恢复默认设置
    </button>
  );
}
