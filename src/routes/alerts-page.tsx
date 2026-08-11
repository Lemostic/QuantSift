import { useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  FlaskConical,
  KeyRound,
  MessageSquareText,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { loadRecommendations } from "@/data/recommendation-service";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { processScanAlerts } from "@/alerts/alert-service";
import {
  announceAlertChange,
  getAlertRepository,
  useAlertCenter,
} from "@/alerts/use-alert-center";
import type { AlertJob, AlertPolicy } from "@/alerts/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";

export function AlertsPage() {
  const alerts = useAlertCenter();
  const [testing, setTesting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const update = (patch: Partial<AlertPolicy>) => {
    void alerts.updatePolicy({ ...alerts.policy, ...patch });
  };

  const sendTest = async () => {
    setTesting(true);
    setActionMessage(null);
    try {
      const recommendations = await loadRecommendations(recordedMarketDataProvider);
      const result = await processScanAlerts({
        scanId: `test-${Date.now()}`,
        recommendations: recommendations.slice(0, 1),
        policy: {
          ...alerts.policy,
          enabled: true,
          minimumScore: 0,
          maxMessages: 1,
          quietHours: { start: "00:00", end: "00:00" },
        },
        repository: getAlertRepository(),
      });
      announceAlertChange();
      setActionMessage(result.sent === 1 ? "测试消息已发送" : "没有可发送的测试信号");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "h-auto min-h-full gap-5 px-5 py-5 lg:px-7",
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase text-primary">
            SMS Alerts
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold">短信提醒</h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            扫描命中指定信号后发送通知；默认模拟模式不会产生短信费用。
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void sendTest()}
          disabled={testing}
          className="gap-2 active:translate-y-px"
        >
          <Send className="h-4 w-4" />
          {testing ? "测试中" : "发送测试消息"}
        </Button>
      </header>

      {(alerts.error || actionMessage) && (
        <div className="border-l-2 border-primary bg-primary/[0.05] px-4 py-3 text-xs text-foreground-muted">
          {alerts.error ?? actionMessage}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <SettingsPanel
            title="触发策略"
            description="定时与手动扫描完成后使用相同规则"
            icon={BellRing}
          >
            <SettingRow title="启用短信提醒" description="关闭后不会创建发送任务">
              <input
                type="checkbox"
                checked={alerts.policy.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </SettingRow>
            <SettingRow title="最低评分" description="仅发送大于等于该分数的信号">
              <input
                type="number"
                min={0}
                max={100}
                value={alerts.policy.minimumScore}
                onChange={(event) =>
                  update({ minimumScore: Number(event.target.value) })
                }
                className="h-8 w-20 border border-input bg-background px-2 text-right font-mono text-xs outline-none focus:border-primary"
              />
            </SettingRow>
            <SettingRow title="单次上限" description="避免一次扫描产生过多短信">
              <input
                type="number"
                min={1}
                max={10}
                value={alerts.policy.maxMessages}
                onChange={(event) =>
                  update({ maxMessages: Number(event.target.value) })
                }
                className="h-8 w-20 border border-input bg-background px-2 text-right font-mono text-xs outline-none focus:border-primary"
              />
            </SettingRow>
            <div className="px-4 py-3.5">
              <div className="text-xs font-medium">信号类型</div>
              <div className="mt-2 flex flex-wrap gap-3">
                {(
                  [
                    ["buy_watch", "买入观察"],
                    ["hold", "继续观察"],
                    ["avoid", "暂不交易"],
                  ] as const
                ).map(([signal, label]) => (
                  <label key={signal} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={alerts.policy.signals.includes(signal)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...alerts.policy.signals, signal]
                          : alerts.policy.signals.filter((item) => item !== signal);
                        update({ signals: next });
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </SettingsPanel>

          <SettingsPanel
            title="收件与免打扰"
            description="号码只保存在当前设备"
            icon={ShieldCheck}
          >
            <FieldRow label="手机号码">
              <input
                type="tel"
                value={alerts.policy.recipient}
                onChange={(event) => update({ recipient: event.target.value.trim() })}
                placeholder="11 位手机号"
                maxLength={11}
                className="h-8 w-full border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
              />
            </FieldRow>
            <div className="grid grid-cols-2 gap-3 px-4 py-3.5">
              <FieldRow label="开始">
                <input
                  type="time"
                  value={alerts.policy.quietHours.start}
                  onChange={(event) =>
                    update({
                      quietHours: {
                        ...alerts.policy.quietHours,
                        start: event.target.value,
                      },
                    })
                  }
                  className="h-8 w-full border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                />
              </FieldRow>
              <FieldRow label="结束">
                <input
                  type="time"
                  value={alerts.policy.quietHours.end}
                  onChange={(event) =>
                    update({
                      quietHours: {
                        ...alerts.policy.quietHours,
                        end: event.target.value,
                      },
                    })
                  }
                  className="h-8 w-full border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                />
              </FieldRow>
            </div>
          </SettingsPanel>

          <SettingsPanel
            title="发送通道"
            description="先用模拟通道验证流程，再接入供应商 Webhook"
            icon={KeyRound}
          >
            <div className="grid grid-cols-2 gap-2 p-4">
              {(["simulation", "webhook"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update({ gatewayMode: mode })}
                  className={cn(
                    "border px-3 py-2 text-left text-xs transition-colors active:translate-y-px",
                    alerts.policy.gatewayMode === mode
                      ? "border-primary bg-primary/[0.07] text-foreground"
                      : "border-border text-foreground-muted hover:bg-accent/50",
                  )}
                >
                  {mode === "simulation" ? "模拟发送" : "HTTPS Webhook"}
                </button>
              ))}
            </div>
            {alerts.policy.gatewayMode === "webhook" && (
              <div className="space-y-3 border-t border-border p-4">
                <FieldRow label="Webhook URL">
                  <input
                    type="url"
                    value={alerts.policy.webhookUrl}
                    onChange={(event) => update({ webhookUrl: event.target.value })}
                    placeholder="https://sms-gateway.example/send"
                    className="h-8 w-full border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                  />
                </FieldRow>
                <FieldRow label="Bearer Token">
                  <input
                    type="password"
                    value={alerts.policy.bearerToken}
                    onChange={(event) => update({ bearerToken: event.target.value })}
                    placeholder="本机保存，不进入 Git"
                    autoComplete="off"
                    className="h-8 w-full border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                  />
                </FieldRow>
              </div>
            )}
          </SettingsPanel>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/55">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">发送记录</h2>
              <p className="mt-1 text-[11px] text-foreground-muted">
                同一扫描与标的只会创建一次消息
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {alerts.jobs.length} JOBS
            </Badge>
          </div>
          {!alerts.ready ? (
            <div className="h-48 shimmer" aria-label="正在加载短信记录" />
          ) : alerts.jobs.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-6 text-center">
              <div>
                <MessageSquareText className="mx-auto h-6 w-6 text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">尚无发送记录</h3>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  填写手机号后发送测试消息，或等待扫描命中告警策略。
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {alerts.jobs.map((job) => (
                <AlertHistoryRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsPanel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof BellRing;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-background-elevated/55">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-[11px] text-foreground-muted">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </section>
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block px-4 py-3.5">
      <span className="mb-1.5 block text-[11px] text-foreground-muted">{label}</span>
      {children}
    </label>
  );
}

function AlertHistoryRow({ job }: { job: AlertJob }) {
  const status = {
    queued: { label: "队列中", icon: Clock3, className: "text-primary" },
    sent: {
      label: "已发送",
      icon: CheckCircle2,
      className: "text-accent-emerald",
    },
    failed: { label: "失败", icon: XCircle, className: "text-accent-rose" },
  }[job.status];
  const StatusIcon = status.icon;

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", status.className)} />
          <span className="text-xs font-medium">{status.label}</span>
          <Badge variant="outline" className="text-[9px]">
            {job.id.startsWith("test-") ? "测试" : "扫描"}
          </Badge>
        </div>
        <time className="font-mono text-[10px] text-foreground-subtle">
          {new Date(job.createdAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      <p className="mt-2 text-xs leading-5 text-foreground-muted">{job.message}</p>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-foreground-subtle">
        {job.status === "sent" && job.recipient ? maskPhone(job.recipient) : job.error}
        {job.attempts > 0 && <span>尝试 {job.attempts} 次</span>}
        {job.id.startsWith("test-") && <FlaskConical className="h-3 w-3" />}
      </div>
    </div>
  );
}

function maskPhone(phone: string) {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "已配置";
}
