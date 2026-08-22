import type { KeyPoint } from "@/quant/key-points";

/**
 * K 线关键点 AI 分析结果的本地缓存。
 * 键 = 标的 + 日期 + 模型 + 提示词模板版本；同一点反复悬停不重复调用
 * 模型、不重复消耗 token。容量与时效均有上限，可一键清空。
 */

export interface PointAnalysisCacheEntry {
  content: string;
  createdAt: string;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface CacheDocument {
  version: 1;
  entries: Record<string, PointAnalysisCacheEntry>;
}

const STORAGE_KEY = "quantsift.point-analysis.v1";
const MAX_ENTRIES = 120;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export function pointAnalysisCacheKey(
  instrumentId: string,
  point: KeyPoint,
  providerId: string,
  model: string,
  templateVersion: number,
): string {
  return [instrumentId, point.tradeDate, providerId, model, "v" + templateVersion].join("|");
}

export class LocalPointAnalysisCache {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key = STORAGE_KEY,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(cacheKey: string): string | null {
    const document = this.read();
    const entry = document.entries[cacheKey];
    if (!entry) return null;
    if (this.now() - new Date(entry.createdAt).getTime() > TTL_MS) {
      delete document.entries[cacheKey];
      this.write(document);
      return null;
    }
    return entry.content;
  }

  set(cacheKey: string, content: string): void {
    const document = this.read();
    document.entries[cacheKey] = {
      content,
      createdAt: new Date(this.now()).toISOString(),
    };
    const keys = Object.keys(document.entries);
    if (keys.length > MAX_ENTRIES) {
      // 淘汰最早的条目（插入顺序即创建顺序的近似）。
      const excess = keys.length - MAX_ENTRIES;
      for (const oldest of keys.slice(0, excess)) {
        delete document.entries[oldest];
      }
    }
    this.write(document);
  }

  clear(): void {
    this.write({ version: 1, entries: {} });
  }

  count(): number {
    return Object.keys(this.read().entries).length;
  }

  private read(): CacheDocument {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return { version: 1, entries: {} };
    try {
      const parsed = JSON.parse(raw) as Partial<CacheDocument>;
      if (
        parsed.version === 1 &&
        parsed.entries &&
        typeof parsed.entries === "object"
      ) {
        return { version: 1, entries: parsed.entries };
      }
    } catch {
      // 损坏数据回退为空缓存。
    }
    return { version: 1, entries: {} };
  }

  private write(document: CacheDocument): void {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}
