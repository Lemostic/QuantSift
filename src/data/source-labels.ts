/**
 * 免费行情数据源的中文标签与样式。DailyBar.provider / IndexSnapshot.provider
 * 记录实际提供数据的免费源（回退链：eastmoney → sina → tencent；
 * 净值：eastmoney → eastmoney_mob）。
 */
export const SOURCE_LABELS: Record<string, string> = {
  eastmoney: "东方财富",
  eastmoney_mob: "东财移动",
  sina: "新浪财经",
  tencent: "腾讯行情",
  recorded: "离线样本",
  fixture: "演示样本",
  offline: "本地样本",
};

export function sourceLabel(provider: string | undefined | null): string {
  if (!provider) return "未知来源";
  return SOURCE_LABELS[provider] ?? provider;
}
