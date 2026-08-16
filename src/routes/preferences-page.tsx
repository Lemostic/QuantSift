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
import { registry } from "@/data/provider-registry";
import { getBrowserBarCache } from "@/cache/browser-store";
import { cacheStats } from "@/cache/service";
import type { CacheStats } from "@/cache/service";
import {
  DEFAULT_FACTOR_TAGS,
  type FactorConfig,
  type FactorTag,
  type IntradaySchedule,
  type LlmProviderConfig,
} from "@/ai/types";
import {
  LLM_PROVIDER_PRESETS,
  presetById,
} from "@/ai/provider-presets";

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
  const allTags = useMemo(() => {
    const builtIn = DEFAULT_FACTOR_TAGS;
    const custom = config.tags
      .filter((setting) => !builtIn.some((tag) => tag.id === setting.tagId))
      .map(
        (setting): FactorTag => ({
          id: setting.tagId,
          label: setting.tagId,
          description: "自定义因子",
        }),
      );
    return [...builtIn, ...custom];
  }, [config.tags]);

  const toggle = (tagId: string) => {
    onChange({
      ...config,
      tags: config.tags.map((setting) =>
        setting.tagId === tagId
          ? { ...setting, enabled: !setting.enabled }
          : setting,
      ),
    });
  };

  return (
    <SettingsGroup
      title="随机因子"
      description="每次智能扫描会基于种子为启用的因子生成随机强调角度（偏多/偏空/中性），覆盖全球市场、国内市场与政策面等维度；种子随会话留存，可复现。随机度 0 表示不使用随机波动。"
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
  source: "eastmoney" | "recorded";
  allowFallback: boolean;
  onSourceChange: (source: "eastmoney" | "recorded") => void;
  onFallbackChange: (allow: boolean) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const provider = registry.provider(source);
      const instruments = await provider.listInstruments();
      await provider.getDailyBars("CN:510300", 1);
      setTestResult({
        ok: true,
        message:
          source === "eastmoney"
            ? `实时数据服务可用，已读取 ${instruments.length} 个标的`
            : `离线样本可用，包含 ${instruments.length} 个标的`,
      });
    } catch (cause) {
      setTestResult({
        ok: false,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <ProviderOption
          active={source === "eastmoney"}
          icon={<WifiHigh size={18} className="text-primary" />}
          title="东方财富实时数据"
          detail="应用内置数据服务直接读取 A 股、ETF 与公募基金行情，无需 API 密钥，不依赖 Python。"
          onClick={() => {
            onSourceChange("eastmoney");
            setTestResult(null);
          }}
        />
        <ProviderOption
          active={source === "recorded"}
          warning
          icon={<Database size={18} className="text-accent-amber" />}
          title="离线样本"
          detail="固定录制数据，仅用于演示和测试，不代表当前市场行情。"
          onClick={() => {
            onSourceChange("recorded");
            setTestResult(null);
          }}
        />
      </div>

      <label
        className={cn(
          "flex items-center justify-between gap-4 border-y border-border/60 py-3",
          source === "recorded" && "opacity-50",
        )}
      >        <span>
          <span className="block text-xs font-medium">实时源失败时使用离线样本</span>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-4 text-[11px]">
          {testResult && (
            <span
              className={cn(
                "flex items-center gap-1.5",
                testResult.ok ? "text-accent-emerald" : "text-accent-rose",
              )}
            >
              {testResult.ok ? <Check size={13} /> : <Warning size={13} />}
              {testResult.message}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={testing}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <WifiHigh size={14} />
          {testing ? "测试中" : "测试连接"}
        </button>
      </div>
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
