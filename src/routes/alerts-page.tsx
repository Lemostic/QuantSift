import { useEffect, useState } from "react";
import {
  Warning,
  BellRinging,
  Check,
  CheckCircle,
  Clock,
  Eye,
  EyeSlash,
  ChatText,
  PencilSimple,
  Repeat,
  FloppyDisk,
  PaperPlaneTilt,
  ShieldCheck,
  XCircle,
} from "@phosphor-icons/react";
import { useAlertCenter } from "@/alerts/use-alert-center";
import {
  isValidMainlandMobile,
  maskPhoneNumber,
  normalizePhoneNumber,
} from "@/alerts/alert-builder";
import type { AlertJob, AlertSettings } from "@/alerts/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";

export function AlertsPage() {
  const alerts = useAlertCenter();
  const [draft, setDraft] = useState<AlertSettings>(alerts.settings);
  const [editingPhone, setEditingPhone] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => setDraft(alerts.settings), [alerts.settings]);

  const patchPolicy = (patch: Partial<AlertSettings["policy"]>) =>
    setDraft((current) => ({
      ...current,
      policy: { ...current.policy, ...patch },
    }));
  const patchGateway = (patch: Partial<AlertSettings["gateway"]>) =>
    setDraft((current) => ({
      ...current,
      gateway: { ...current.gateway, ...patch },
    }));

  const validate = () => {
    if (draft.policy.enabled && !isValidMainlandMobile(draft.phoneNumber)) {
      return "启用提醒前需要填写有效的中国大陆手机号码";
    }
    if (draft.gateway.mode === "webhook" && draft.gateway.webhookEnabled) {
      try {
        const endpoint = new URL(draft.gateway.endpoint);
        if (endpoint.protocol !== "https:") return "Webhook 地址必须使用 HTTPS";
      } catch {
        return "请输入有效的 Webhook 地址";
      }
    }
    if (draft.policy.signals.length === 0) return "至少选择一种提醒信号";
    return null;
  };

  const save = async () => {
    const message = validate();
    if (message) {
      setValidationError(message);
      return;
    }
    const normalized = {
      ...draft,
      phoneNumber: normalizePhoneNumber(draft.phoneNumber),
    };
    try {
      await alerts.saveSettings(normalized);
      setDraft(normalized);
      setEditingPhone(false);
      setValidationError(null);
      setNotice("提醒设置已保存");
    } catch {
      // The hook exposes the persisted error state.
    }
  };

  const test = async () => {
    const message = validate();
    if (message) {
      setValidationError(message);
      return;
    }
    try {
      await alerts.sendTest({
        ...draft,
        phoneNumber: normalizePhoneNumber(draft.phoneNumber),
      });
      setValidationError(null);
      setNotice("测试提醒已进入发件箱");
    } catch {
      // The hook exposes the gateway error state.
    }
  };

  const toggleSignal = (signal: AlertSettings["policy"]["signals"][number]) => {
    const next = draft.policy.signals.includes(signal)
      ? draft.policy.signals.filter((item) => item !== signal)
      : [...draft.policy.signals, signal];
    patchPolicy({ signals: next });
  };

  const sentCount = alerts.jobs.filter((job) => job.status === "sent").length;
  const waitingCount = alerts.jobs.filter((job) =>
    ["queued", "sending"].includes(job.status),
  ).length;

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
            DELIVERY / ALERT CENTER
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">提醒中心</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              管理扫描后的提醒策略、发送通道和本地发件箱
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void test()}
            disabled={alerts.busy || !alerts.ready}
            className="gap-2"
          >
            <PaperPlaneTilt className="h-4 w-4" />
            测试通道
          </Button>
          <Button
            onClick={() => void save()}
            disabled={alerts.busy || !alerts.ready}
            className="gap-2"
          >
            <FloppyDisk className="h-4 w-4" />
            保存设置
          </Button>
        </div>
      </header>

      {(alerts.error || validationError) && (
        <div className="flex items-center gap-2 border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          <Warning className="h-4 w-4 shrink-0" weight="fill" />
          {validationError ?? alerts.error}
        </div>
      )}
      {notice && !alerts.error && !validationError && (
        <div className="flex items-center justify-between gap-3 border-l-2 border-accent-emerald bg-accent-emerald/[0.05] px-4 py-3 text-xs text-accent-emerald">
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-foreground-subtle hover:text-foreground"
            aria-label="关闭提示"
          >
            关闭
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 border-y border-border bg-background-elevated/35 sm:grid-cols-3">
        <StatusMetric
          icon={BellRinging}
          label="提醒策略"
          value={draft.policy.enabled ? "已启用" : "已关闭"}
          active={draft.policy.enabled}
        />
        <StatusMetric
          icon={ChatText}
          label="发送通道"
          value={draft.gateway.mode === "simulation" ? "模拟" : "Webhook"}
          active={
            draft.gateway.mode === "simulation" || draft.gateway.webhookEnabled
          }
        />
        <StatusMetric
          icon={ShieldCheck}
          label="本地发件箱"
          value={`${sentCount} 已发送 / ${waitingCount} 等待`}
          active={waitingCount === 0}
        />
      </section>

      <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
        <div className="self-start overflow-hidden rounded-lg border border-border bg-background-elevated/55">
          <SectionHeader title="策略与通道" detail="设置仅保存在当前设备" />
          <div className="divide-y divide-border/70">
            <SettingRow title="启用短信提醒" description="仅定时扫描完成后触发">
              <input
                type="checkbox"
                checked={draft.policy.enabled}
                onChange={(event) => patchPolicy({ enabled: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </SettingRow>

            <div className="px-4 py-3.5">
              <div className="text-xs font-medium">接收号码</div>
              {editingPhone || !draft.phoneNumber ? (
                <div className="relative mt-2">
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={draft.phoneNumber}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        phoneNumber: event.target.value,
                      }))
                    }
                    placeholder="138 0000 0000"
                    className="h-9 w-full border border-input bg-background px-3 pr-10 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  {draft.phoneNumber && (
                    <button
                      type="button"
                      onClick={() => setEditingPhone(false)}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-foreground-subtle hover:text-foreground"
                      aria-label="隐藏手机号码"
                      title="隐藏号码"
                    >
                      <EyeSlash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPhone(true)}
                  className="mt-2 flex h-9 w-full items-center justify-between border border-input bg-background px-3 font-mono text-sm hover:border-border-strong"
                >
                  <span>{maskPhoneNumber(draft.phoneNumber)}</span>
                  <PencilSimple className="h-3.5 w-3.5 text-foreground-subtle" />
                </button>
              )}
            </div>

            <div className="px-4 py-3.5">
              <div className="text-xs font-medium">触发信号</div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  ["buy_watch", "买入观察"],
                  ["hold", "继续观察"],
                  ["avoid", "暂不交易"],
                ] as const).map(([signal, label]) => (
                  <label
                    key={signal}
                    className={cn(
                      "flex min-w-0 items-center gap-2 border px-2.5 py-2 text-[11px]",
                      draft.policy.signals.includes(signal)
                        ? "border-primary/40 bg-primary/[0.06] text-foreground"
                        : "border-border text-foreground-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={draft.policy.signals.includes(signal)}
                      onChange={() => toggleSignal(signal)}
                      className="h-3.5 w-3.5 shrink-0 accent-primary"
                    />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-2">
              <NumberField
                label="最低评分"
                value={draft.policy.minimumScore}
                min={0}
                max={100}
                onChange={(minimumScore) => patchPolicy({ minimumScore })}
              />
              <NumberField
                label="每次最多发送"
                value={draft.policy.maxMessagesPerScan}
                min={1}
                max={10}
                onChange={(maxMessagesPerScan) =>
                  patchPolicy({ maxMessagesPerScan })
                }
              />
            </div>

            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium">免打扰时段</div>
                  <div className="mt-1 text-[11px] text-foreground-subtle">
                    期间生成的提醒延迟到结束时间
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draft.policy.quietHours.enabled}
                  onChange={(event) =>
                    patchPolicy({
                      quietHours: {
                        ...draft.policy.quietHours,
                        enabled: event.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 accent-primary"
                />
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {(["start", "end"] as const).map((key, index) => (
                  <div key={key} className="contents">
                    {index === 1 && (
                      <span className="text-xs text-foreground-subtle">至</span>
                    )}
                    <input
                      type="time"
                      value={draft.policy.quietHours[key]}
                      disabled={!draft.policy.quietHours.enabled}
                      onChange={(event) =>
                        patchPolicy({
                          quietHours: {
                            ...draft.policy.quietHours,
                            [key]: event.target.value,
                          },
                        })
                      }
                      className="h-8 min-w-0 border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-xs font-medium">短信通道</div>
              <div className="mt-2 grid grid-cols-2 border border-border">
                {(["simulation", "webhook"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patchGateway({ mode })}
                    className={cn(
                      "h-8 text-xs",
                      draft.gateway.mode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground-muted hover:bg-accent",
                    )}
                    aria-pressed={draft.gateway.mode === mode}
                  >
                    {mode === "simulation" ? "模拟通道" : "HTTPS Webhook"}
                  </button>
                ))}
              </div>
            </div>

            {draft.gateway.mode === "webhook" && (
              <div className="space-y-3 px-4 py-3.5">
                <label className="block">
                  <span className="text-[11px] text-foreground-muted">Webhook 地址</span>
                  <input
                    type="url"
                    value={draft.gateway.endpoint}
                    onChange={(event) => patchGateway({ endpoint: event.target.value })}
                    placeholder="https://example.com/sms"
                    className="mt-1.5 h-9 w-full border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-foreground-muted">Bearer 密钥</span>
                  <div className="relative mt-1.5">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={draft.gateway.secret}
                      onChange={(event) => patchGateway({ secret: event.target.value })}
                      autoComplete="off"
                      className="h-9 w-full border border-input bg-background px-3 pr-10 font-mono text-xs outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((visible) => !visible)}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-foreground-subtle hover:text-foreground"
                      aria-label={showSecret ? "隐藏密钥" : "显示密钥"}
                    >
                      {showSecret ? (
                        <EyeSlash className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </label>
                <label className="flex items-center justify-between gap-3 border border-accent-amber/30 bg-accent-amber/[0.04] px-3 py-2.5">
                  <span className="text-[11px] text-foreground-muted">
                    明确允许向此地址发送
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.gateway.webhookEnabled}
                    onChange={(event) =>
                      patchGateway({ webhookEnabled: event.target.checked })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/55">
          <SectionHeader
            title="本地发件箱"
            detail={`最近 ${alerts.jobs.length} 条 · 最多保留 100 条`}
          />
          {!alerts.ready ? (
            <div className="h-64 shimmer" aria-label="正在加载短信发件箱" />
          ) : alerts.jobs.length === 0 ? (
            <div className="grid min-h-80 place-items-center p-6 text-center">
              <div>
                <ChatText className="mx-auto h-7 w-7 text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">发件箱为空</h3>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  保存号码后测试通道，或等待下一次定时扫描。
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {alerts.jobs.map((job) => (
                <OutboxRow
                  key={job.id}
                  job={job}
                  busy={alerts.busy}
                  onRetry={() => void alerts.retry(job.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="text-[10px] text-foreground-subtle">{detail}</span>
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span>
        <span className="block text-xs font-medium">{title}</span>
        <span className="mt-1 block text-[11px] text-foreground-subtle">
          {description}
        </span>
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="text-[11px] text-foreground-muted">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 h-8 w-full border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
      />
    </label>
  );
}

function StatusMetric({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: typeof BellRinging;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-t border-border px-3 py-3 first:border-t-0 sm:block sm:border-l sm:border-t-0 sm:px-4 sm:py-3.5 sm:first:border-l-0">
      <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
        <Icon className={cn("h-3.5 w-3.5", active ? "text-accent-emerald" : "text-foreground-subtle")} />
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate font-mono text-xs font-semibold sm:mt-1.5 sm:text-sm">
        {value}
      </div>
    </div>
  );
}

function OutboxRow({
  job,
  busy,
  onRetry,
}: {
  job: AlertJob;
  busy: boolean;
  onRetry: () => void;
}) {
  const status = {
    queued: { label: "等待发送", icon: Clock, className: "text-accent-amber" },
    sending: { label: "发送中", icon: Repeat, className: "text-primary" },
    sent: { label: "已发送", icon: CheckCircle, className: "text-accent-emerald" },
    failed: { label: "发送失败", icon: XCircle, className: "text-accent-rose" },
  }[job.status];
  const StatusIcon = status.icon;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusIcon
            className={cn(
              "h-4 w-4",
              status.className,
              job.status === "sending" && "animate-spin",
            )}
          />
          <span className="text-xs font-medium">{status.label}</span>
          <Badge variant="outline" className="text-[9px]">
            {maskPhoneNumber(job.recipient)}
          </Badge>
          <span className="font-mono text-[10px] text-foreground-subtle">
            {job.score > 0 ? `${job.score} 分` : "测试"}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-foreground-muted">
          {job.message}
        </p>
        {job.lastError && (
          <p className="mt-1 text-[10px] text-accent-rose">{job.lastError}</p>
        )}
        <div className="mt-1.5 font-mono text-[9px] text-foreground-subtle">
          {job.provider} · {job.marketDate} · 尝试 {job.attemptCount} 次
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-2">
        <time className="whitespace-nowrap font-mono text-[10px] text-foreground-subtle">
          {new Date(job.createdAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        {job.status === "failed" && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onRetry}
            disabled={busy}
            className="h-7 w-7"
            aria-label="重试发送"
            title="重试发送"
          >
            <Repeat className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
