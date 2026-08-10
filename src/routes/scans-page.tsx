import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Play,
  XCircle,
} from "lucide-react";
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

  const updateSchedule = (patch: Partial<typeof scans.schedule>) => {
    void scans.updateSchedule({ ...scans.schedule, ...patch });
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
            Scheduled Scan
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold">自动扫描</h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            应用运行期间，在工作日收盘后自动分析启用的观察标的。
          </p>
        </div>
        <Button
          onClick={() => void scans.runNow(activeIds)}
          disabled={scans.running || activeIds.length === 0}
          className="gap-2 active:translate-y-px"
        >
          <Play className="h-4 w-4" />
          {scans.running ? "扫描中" : "立即运行"}
        </Button>
      </header>

      {scans.error && (
        <div className="flex items-center gap-2 border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          <AlertTriangle className="h-4 w-4" />
          {scans.error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="self-start rounded-lg border border-border bg-background-elevated/55">
          <div className="border-b border-border px-4 py-3.5">
            <h2 className="text-sm font-semibold">计划设置</h2>
            <p className="mt-1 text-[11px] text-foreground-muted">
              时区固定为 Asia/Shanghai
            </p>
          </div>
          <div className="divide-y divide-border/70">
            <SettingRow
              title="启用自动扫描"
              description="关闭时仍可手动运行"
            >
              <input
                type="checkbox"
                checked={scans.schedule.enabled}
                onChange={(event) =>
                  updateSchedule({ enabled: event.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />
            </SettingRow>
            <SettingRow title="执行时间" description="建议在 A 股收盘后执行">
              <input
                type="time"
                value={scans.schedule.time}
                onChange={(event) => updateSchedule({ time: event.target.value })}
                className="h-8 border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
              />
            </SettingRow>
            <SettingRow title="仅工作日" description="周六、周日不会触发">
              <input
                type="checkbox"
                checked={scans.schedule.weekdaysOnly}
                onChange={(event) =>
                  updateSchedule({ weekdaysOnly: event.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />
            </SettingRow>
            <SettingRow title="扫描范围" description="观察列表中启用的标的">
              <span className="font-mono text-sm">{activeIds.length}</span>
            </SettingRow>
          </div>
          <div className="border-t border-border px-4 py-3 text-[11px] text-foreground-subtle">
            {scans.schedule.enabled
              ? `下一个有效工作日 ${scans.schedule.time} 检查`
              : "自动扫描已关闭"}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/55">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">运行历史</h2>
              <p className="mt-1 text-[11px] text-foreground-muted">
                最近 50 次手动与定时扫描
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {scans.runs.length} RUNS
            </Badge>
          </div>
          {!scans.ready ? (
            <div className="h-48 shimmer" aria-label="正在加载扫描历史" />
          ) : scans.runs.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div>
                <CalendarClock className="mx-auto h-6 w-6 text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">尚无扫描记录</h3>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  点击立即运行，验证当前观察列表的完整扫描流程。
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {scans.runs.map((run) => (
                <ScanHistoryRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      </section>
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

function ScanHistoryRow({ run }: { run: ScanRun }) {
  const status = {
    running: { label: "运行中", icon: Clock3, className: "text-primary" },
    completed: {
      label: "已完成",
      icon: CheckCircle2,
      className: "text-accent-emerald",
    },
    failed: { label: "失败", icon: XCircle, className: "text-accent-rose" },
  }[run.status];
  const StatusIcon = status.icon;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", status.className)} />
          <span className="text-xs font-medium">{status.label}</span>
          <Badge variant="outline" className="text-[9px]">
            {run.trigger === "scheduled" ? "定时" : "手动"}
          </Badge>
        </div>
        <div className="mt-1.5 truncate text-[11px] text-foreground-muted">
          {run.status === "failed"
            ? run.error
            : `${run.instrumentCount} 个标的 · ${run.buyWatchCount} 个买入观察 · ${run.avoidCount} 个暂不交易`}
        </div>
      </div>
      <time className="font-mono text-[10px] text-foreground-subtle">
        {new Date(run.startedAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </time>
    </div>
  );
}

