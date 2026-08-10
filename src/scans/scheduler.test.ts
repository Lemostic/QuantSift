import { describe, expect, it } from "vitest";
import { getDueScan, type ScanSchedule } from "./scheduler";

const schedule: ScanSchedule = {
  enabled: true,
  time: "15:30",
  timezone: "Asia/Shanghai",
  weekdaysOnly: true,
};

describe("getDueScan", () => {
  it("returns one due window after the configured weekday time", () => {
    const due = getDueScan(
      schedule,
      new Date("2026-08-11T15:31:00+08:00"),
      null,
    );

    expect(due).toEqual({
      windowId: "2026-08-11@15:30",
      scheduledFor: "2026-08-11T15:30:00+08:00",
    });
    expect(
      getDueScan(schedule, new Date("2026-08-11T16:00:00+08:00"), due!.windowId),
    ).toBeNull();
  });

  it("does not run before time, on weekends, or while disabled", () => {
    expect(
      getDueScan(schedule, new Date("2026-08-11T15:29:00+08:00"), null),
    ).toBeNull();
    expect(
      getDueScan(schedule, new Date("2026-08-15T16:00:00+08:00"), null),
    ).toBeNull();
    expect(
      getDueScan(
        { ...schedule, enabled: false },
        new Date("2026-08-11T16:00:00+08:00"),
        null,
      ),
    ).toBeNull();
  });
});

