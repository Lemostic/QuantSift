import { describe, expect, it } from "vitest";
import { getDueIntradayScan } from "./intraday-scheduler";
import type { IntradaySchedule } from "./types";

/**
 * 2026-08-19 是周三（本地时区），2026-08-18 周二，2026-08-22 周六。
 * 用本地时间构造，保证 getDay/getHours 按预期取值。
 */
function localDate(day: number, hour: number, minute: number): Date {
  return new Date(2026, 7, day, hour, minute, 0);
}

function schedule(partial: Partial<IntradaySchedule> = {}): IntradaySchedule {
  return {
    enabled: true,
    intervalMinutes: 15,
    startMinutes: 9 * 60,
    endMinutes: 15 * 60,
    ...partial,
  };
}

describe("getDueIntradayScan", () => {
  it("returns null when disabled", () => {
    expect(
      getDueIntradayScan(schedule({ enabled: false }), localDate(19, 10, 0), null),
    ).toBeNull();
  });

  it("returns null on weekends", () => {
    expect(getDueIntradayScan(schedule(), localDate(22, 10, 0), null)).toBeNull();
  });

  it("returns null outside the window", () => {
    expect(getDueIntradayScan(schedule(), localDate(19, 8, 59), null)).toBeNull();
    expect(getDueIntradayScan(schedule(), localDate(19, 15, 0), null)).toBeNull();
  });

  it("is due at the first slot of the window", () => {
    const due = getDueIntradayScan(schedule(), localDate(19, 9, 7), null);
    expect(due).not.toBeNull();
    expect(due!.slotMinutes).toBe(9 * 60);
  });

  it("aligns to the current interval slot", () => {
    const due = getDueIntradayScan(schedule(), localDate(19, 9, 37), null);
    expect(due!.slotMinutes).toBe(9 * 60 + 30); // 9:30 槽
  });

  it("does not re-run the same slot", () => {
    const slot = getDueIntradayScan(schedule(), localDate(19, 9, 20), null);
    const after = getDueIntradayScan(
      schedule(),
      localDate(19, 9, 25),
      new Date(slot!.slotAt),
    );
    expect(after).toBeNull();
  });

  it("is due again after the next slot starts", () => {
    const slot = getDueIntradayScan(schedule(), localDate(19, 9, 20), null);
    const after = getDueIntradayScan(
      schedule(),
      localDate(19, 9, 31),
      new Date(slot!.slotAt),
    );
    expect(after).not.toBeNull();
    expect(after!.slotMinutes).toBe(9 * 60 + 30);
  });

  it("allows a new run on the next trading day", () => {
    const yesterday = new Date(2026, 7, 18, 9, 30, 0); // 周二
    const today = new Date(2026, 7, 19, 9, 32, 0); // 周三
    const due = getDueIntradayScan(schedule(), today, yesterday);
    expect(due).not.toBeNull();
  });

  it("clamps an unknown interval to the nearest valid one", () => {
    const due = getDueIntradayScan(
      schedule({ intervalMinutes: 7 }),
      localDate(19, 9, 20),
      null,
    );
    expect(due!.intervalMinutes).toBe(5);
  });
});
