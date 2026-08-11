import { motion } from "framer-motion";
import {
  CalendarBlank,
  CheckCircle,
  Clock,
  Play,
  Timer,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { useWatchlist } from "@/watchlist/use-watchlist";
import { useScanCenter } from "@/scans/use-scan-center";
import type { ScanRun } from "@/scans/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";

export function ScansPage() {
  const watchlist = useWatchlist();
  const scans = useScanCenter();
  const activeIds = watchlist.entries
    .filter((entry) => entry.enabled)
    .map((entry) => entry.instrumentId);
  const latest = scans.runs[0];

  const updateSchedule = (patch: Partial<typeof scans.schedule>) => {
    void scans.updateSchedule({ ...scans.schedule, ...patch });
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
            AUTOMATION / SCAN ENGINE
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">扫描调度</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              在应用运行期间自动刷新研究信号
            </p>
          </div>
        </div>
        <Button
          onClick={() => void scans.runNow(activeIds)}
          disabled={scans.running || activeIds.length === 0}
          className="gap-2 active:scale-[0.98]"
        >
          <Play size={15} weight="fill" />
          {scans.running ? "扫描中" : "立即运行"}
        </Button>
      </header>

      {scans.error && (
        <div className="flex items-center gap-2 border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          <Warning size={16} weight="fill" />
          {scans.error}
        </div>
      )}

      <section className="grid grid-cols-2 border-y border-border bg-background-elevated/30 lg:grid-cols-4">
        <ScanMetric
          label="引擎状态"
          value={scans.running ? "运行中" : "就绪"}
          detail={scans.running ? "正在计算监控队列" : "等待下一次触发"}
          active={scans.running}
        />
        <ScanMetric
          label="扫描范围"
          value={String(activeIds.length)}
          detail="已启用的观察标的"
          bordered
        />
        <ScanMetric
          label="最近信号"
          value={latest ? String(latest.buyWatchCount) : "--"}
          detail="买入观察"
          bordered
          topOnMobile
        />
        <ScanMetric
          label="下次检查"
          value={scans.schedule.enabled ? scans.schedule.time : "已关闭"}
          detail="Asia/Shanghai · 工作日"
          bordered
          topOnMobile
        />
      </section>

      <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,0.66fr)_minmax(0,1.34fr)]">
        <div className="self-start overflow-hidden rounded-lg border border-border bg-background-elevated/50 shadow-diffusion-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">执行计划</h2>
              <p className="mt-0.5 text-[10px] text-foreground-muted">
                时区固定为 Asia/Shanghai
              </p>
            </div>
            <Timer size={18} weight="duotone" className="text-primary" />
          </div>
          <div className="divide-y divide-border/70">
            <SettingRow title="启用自动扫描" description="关闭后仍可手动运行">
              <ScheduleToggle
                enabled={scans.schedule.enabled}
                onChange={(enabled) => updateSchedule({ enabled })}
              />
            </SettingRow>
            <SettingRow title="执行时间" description="建议在 A 股收盘后执行">
              <input
                type="time"
                value={scans.schedule.time}
                onChange={(event) => updateSchedule({ time: event.target.value })}
                className="h-8 border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </SettingRow>
            <SettingRow title="仅工作日" description="周六、周日不会触发">
              <ScheduleToggle
                enabled={scans.schedule.weekdaysOnly}
                onChange={(weekdaysOnly) => updateSchedule({ weekdaysOnly })}
              />
            </SettingRow>
            <SettingRow title="当前范围" description="观察列表中启用的标的">
              <span className="font-mono text-lg font-semibold text-primary">
                {activeIds.length}
              </span>
            </SettingRow>
          </div>
          <div className="flex items-start gap-2 border-t border-border bg-muted/25 px-4 py-3 text-[10px] leading-4 text-foreground-subtle">
            <CalendarBlank size={14} className="mt-0.5 shrink-0" />
            {scans.schedule.enabled
              ? `将在下一个有效工作日 ${scans.schedule.time} 检查一次，关闭应用后不会后台运行。`
              : "自动扫描已关闭，研究台和此页面仍支持手动扫描。"}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/50">
          <div className="flex items-end justify-between gap-4 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">运行时间线</h2>
              <p className="mt-0.5 text-[10px] text-foreground-muted">
                最近 50 次手动与定时扫描
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-[9px]">
              {scans.runs.length} RUNS
            </Badge>
          </div>
          {!scans.ready ? (
            <div className="h-64 bg-muted/50 shimmer" aria-label="正在加载扫描历史" />
          ) : scans.runs.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-6 text-center">
              <div>
                <CalendarBlank size={26} className="mx-auto text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">尚无扫描记录</h3>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  点击立即运行，验证当前观察列表的完整扫描流程。
                </p>
              </div>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
              className="divide-y divide-border/70"
            >
              {scans.runs.map((run, index) => (
                <ScanHistoryRow key={run.id} run={run} latest={index === 0} />
              ))}
            </motion.div>
          )}
        </div>
      </section>
    </div>
  );
}

function ScanMetric({
  label,
  value,
  detail,
  active,
  bordered,
  topOnMobile,
}: {
  label: string;
  value: string;
  detail: string;
  active?: boolean;
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
      <div className="flex items-center gap-2 text-[9px] text-foreground-muted sm:text-[10px]">
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-ring" />}
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-lg font-semibold sm:text-xl">{value}</div>
      <div className="mt-0.5 truncate text-[8px] text-foreground-subtle sm:text-[9px]">{detail}</div>
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
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <div className="text-xs font-medium">{title}</div>
        <div className="mt-1 text-[10px] text-foreground-subtle">{description}</div>
      </div>
      {children}
    </div>
  );
}

function ScheduleToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors active:scale-[0.96]",
        enabled
          ? "border-primary/40 bg-primary/20"
          : "border-border-strong bg-muted",
      )}
    >
      <motion.span
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

function ScanHistoryRow({ run, latest }: { run: ScanRun; latest: boolean }) {
  const status = {
    running: { label: "运行中", icon: Clock, className: "text-primary" },
    completed: {
      label: "已完成",
      icon: CheckCircle,
      className: "text-accent-emerald",
    },
    failed: { label: "失败", icon: XCircle, className: "text-accent-rose" },
  }[run.status];
  const StatusIcon = status.icon;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: 6 }, visible: { opacity: 1, x: 0 } }}
      transition={{ type: "spring", stiffness: 130, damping: 20 }}
      className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 px-4 py-3.5"
    >
      <div className="relative grid h-7 w-7 place-items-center rounded-md bg-muted">
        <StatusIcon size={15} weight="duotone" className={status.className} />
        {latest && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background-elevated bg-primary" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{status.label}</span>
          <Badge variant="outline" className="text-[8px]">
            {run.trigger === "scheduled" ? "定时" : "手动"}
          </Badge>
          {latest && <span className="font-mono text-[8px] text-primary">LATEST</span>}
        </div>
        <div className="mt-1 truncate text-[10px] text-foreground-muted">
          {run.status === "failed"
            ? run.error
            : `${run.instrumentCount} 个标的 · ${run.buyWatchCount} 个买入观察 · ${run.avoidCount} 个暂不交易`}
        </div>
      </div>
      <time className="whitespace-nowrap font-mono text-[9px] text-foreground-subtle">
        {new Date(run.startedAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </time>
    </motion.div>
  );
}
