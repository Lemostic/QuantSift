import type { DueIntradayScan, IntradaySchedule } from "./types";

const VALID_INTERVALS = new Set([5, 10, 15, 30, 60]);

function clampInterval(minutes: number): number {
  if (VALID_INTERVALS.has(minutes)) return minutes;
  return minutes >= 30 ? 30 : minutes >= 15 ? 15 : minutes >= 10 ? 10 : 5;
}

/**
 * 交易时段智能扫描调度（确定性）：
 *
 * - 未启用 / 周末 / 窗口外 → null
 * - 窗口内按 intervalMinutes 划分时间槽；`now` 落在某个时间槽且该槽从未
 *   执行过（lastRunAt 早于槽起点或不是同一交易日）→ 返回该槽。
 * - 每个槽最多触发一次。
 */
export function getDueIntradayScan(
  schedule: IntradaySchedule,
  now: Date,
  lastRunAt: Date | null,
): DueIntradayScan | null {
  if (!schedule.enabled) return null;
  const day = now.getDay();
  if (day === 0 || day === 6) return null;

  const start = Math.max(0, Math.min(1440, schedule.startMinutes));
  const end = Math.max(start + 1, Math.min(1440, schedule.endMinutes));
  const interval = clampInterval(schedule.intervalMinutes);
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (minutes < start || minutes >= end) return null;

  const slotIndex = Math.floor((minutes - start) / interval);
  const slotMinutes = start + slotIndex * interval;

  const slotDate = new Date(now);
  slotDate.setHours(0, slotMinutes, 0, 0);

  const ranThisSlot =
    lastRunAt !== null &&
    lastRunAt.toDateString() === slotDate.toDateString() &&
    lastRunAt.getTime() >= slotDate.getTime();

  if (ranThisSlot) return null;

  return { slotAt: slotDate.toISOString(), slotMinutes, intervalMinutes: interval };
}
