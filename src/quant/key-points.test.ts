import { describe, expect, it } from "vitest";
import type { DailyBar } from "./types";
import { buildKeyPoints, KEY_POINT_KIND_LABEL } from "./key-points";

/** 构造确定性日线：closes 为逐日收盘，volumes 可选。 */
function series(
  instrumentId: string,
  closes: number[],
  volumes?: number[],
): DailyBar[] {
  const start = new Date("2026-06-01T00:00:00Z");
  const bars: DailyBar[] = [];
  let cursor = new Date(start);
  let step = 0;
  while (bars.length < closes.length) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const close = closes[step];
      const volume = volumes?.[step] ?? 10_000_000;
      bars.push({
        instrumentId,
        tradeDate: cursor.toISOString().slice(0, 10),
        open: close * 0.99,
        high: close * 1.02,
        low: close * 0.98,
        close,
        volume,
        adjustment: "forward",
        provider: "eastmoney",
        fetchedAt: "2026-08-15T15:30:00+08:00",
      });
      step += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars;
}

describe("buildKeyPoints", () => {
  it("detects a golden cross after a dip", () => {
    // 40 日下跌后 15 日回升 → MA5 应上穿 MA20。
    const closes: number[] = [];
    for (let i = 0; i < 40; i += 1) closes.push(100 - i);
    for (let i = 0; i < 15; i += 1) closes.push(60 + i * 3);
    const bars = series("CN:600519", closes);

    const points = buildKeyPoints(bars, 20);
    const golden = points.find((point) => point.kind === "golden_cross");
    expect(golden).toBeDefined();
    expect(golden!.signal).toBe("bullish");
    expect(golden!.indicators.ma5).not.toBeNull();
    expect(golden!.indicators.ma20).not.toBeNull();
    expect(golden!.importance).toBeGreaterThan(50);
  });

  it("detects a breakout with volume spike", () => {
    const closes: number[] = [];
    for (let i = 0; i < 45; i += 1) closes.push(50 + (i % 5)); // 横盘
    closes.push(60); // 第 45 根：放量大突破。
    const volumes = Array.from({ length: 46 }, () => 10_000_000);
    volumes[45] = 30_000_000;
    const bars = series("CN:000001", closes, volumes);

    const points = buildKeyPoints(bars, 20);
    const breakout = points.find((point) => point.kind === "breakout");
    expect(breakout).toBeDefined();
    expect(breakout!.tradeDate).toBe(bars.at(-1)!.tradeDate);
    expect(breakout!.changePct).toBeGreaterThan(1.5);
    expect(breakout!.indicators.volumeRatio).toBeGreaterThan(2);
    expect(breakout!.summary).toContain("放量");
  });

  it("detects a support test with a long lower wick", () => {
    const closes: number[] = [];
    for (let i = 0; i < 39; i += 1) closes.push(100 + (i % 4)); // 高位横盘
    closes.push(96, 98); // 前一日小跌，测试日中性开盘
    const bars = series("CN:600036", closes);
    // 手动改最后一根：深探后收回（长下影，收盘回到区间上沿）。
    const last = bars.at(-1)!;
    last.low = 90;
    last.open = 99.5;
    last.high = 101.5;
    last.close = 101;

    const points = buildKeyPoints(bars, 20);
    const support = points.find((point) => point.kind === "support_test");
    expect(support).toBeDefined();
    expect(support!.signal).toBe("bullish");
    expect(support!.summary).toContain("支撑");
  });

  it("deduplicates nearby points of the same kind", () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i += 1) closes.push(100 - i * 2);
    closes.push(55, 62); // 连续下跌后的两根强反弹
    const bars = series("CN:159915", closes);
    const points = buildKeyPoints(bars, 20);
    const reversals = points.filter(
      (point) => point.kind === "trend_reversal_up",
    );
    expect(reversals.length).toBeLessThanOrEqual(1);
  });

  it("returns an empty list for short or flat histories", () => {
    const bars = series("CN:600519", Array.from({ length: 10 }, () => 10));
    expect(buildKeyPoints(bars)).toEqual([]);

    const flat = series("CN:600519", Array.from({ length: 40 }, () => 10));
    expect(buildKeyPoints(flat)).toEqual([]);
  });

  it("caps the number of returned points by importance", () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i += 1) closes.push(100 - i);
    for (let i = 0; i < 20; i += 1) closes.push(60 + i * 5);
    const bars = series("CN:000001", closes);
    const points = buildKeyPoints(bars, 5);
    expect(points.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i - 1].tradeDate >= points[i].tradeDate).toBe(true);
    }
    expect(KEY_POINT_KIND_LABEL[points[0].kind].length).toBeGreaterThan(0);
  });
});
