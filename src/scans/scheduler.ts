export interface ScanSchedule {
  enabled: boolean;
  time: string;
  timezone: "Asia/Shanghai";
  weekdaysOnly: boolean;
}

export interface DueScan {
  windowId: string;
  scheduledFor: string;
}

interface ZonedParts {
  date: string;
  weekday: string;
  hour: number;
  minute: number;
}

function getZonedParts(now: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function getDueScan(
  schedule: ScanSchedule,
  now: Date,
  lastWindowId: string | null,
): DueScan | null {
  if (!schedule.enabled || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) {
    return null;
  }

  const parts = getZonedParts(now, schedule.timezone);
  if (
    schedule.weekdaysOnly &&
    (parts.weekday === "Sat" || parts.weekday === "Sun")
  ) {
    return null;
  }

  const [scheduledHour, scheduledMinute] = schedule.time.split(":").map(Number);
  const nowMinutes = parts.hour * 60 + parts.minute;
  const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
  if (nowMinutes < scheduledMinutes) return null;

  const windowId = `${parts.date}@${schedule.time}`;
  if (windowId === lastWindowId) return null;

  return {
    windowId,
    scheduledFor: `${parts.date}T${schedule.time}:00+08:00`,
  };
}

