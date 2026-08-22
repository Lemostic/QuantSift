import type { Instrument } from "@/quant/types";

/**
 * 本地标的目录：合并静态目录 + 用户搜索添加过的标的元数据。
 *
 * 自选/持仓可以添加任意 A 股、ETF 与场外基金，但行情命令只认识内置目录；
 * 搜索命中的标的元数据会持久化到这里，provider.listInstruments() 返回
 * 静态目录 + 目录外标的，全站（自选列表、推荐、图表、持仓）统一解析。
 */

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface DirectoryDocument {
  version: 1;
  instruments: Instrument[];
}

const STORAGE_KEY = "quantsift.instrument-directory.v1";
const MAX_INSTRUMENTS = 500;

function isInstrument(value: unknown): value is Instrument {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Instrument>;
  return (
    typeof item.id === "string" &&
    typeof item.symbol === "string" &&
    typeof item.name === "string" &&
    (item.kind === "stock" || item.kind === "fund") &&
    typeof item.exchange === "string"
  );
}

export class LocalInstrumentDirectory {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key = STORAGE_KEY,
  ) {}

  list(): Instrument[] {
    return this.read().instruments;
  }

  lookup(id: string): Instrument | undefined {
    return this.read().instruments.find((instrument) => instrument.id === id);
  }

  /** 合并新增标的（按 id 去重，保持已有序）。 */
  merge(instruments: Instrument[]): void {
    const document = this.read();
    const known = new Map(
      document.instruments.map((instrument) => [instrument.id, instrument]),
    );
    let changed = false;
    for (const instrument of instruments) {
      if (!known.has(instrument.id)) {
        known.set(instrument.id, instrument);
        changed = true;
      }
    }
    if (!changed) return;
    const merged = [...known.values()].slice(0, MAX_INSTRUMENTS);
    this.write({ version: 1, instruments: merged });
  }

  /** 合并静态目录与目录外标的（静态目录优先，保证内置顺序稳定）。 */
  mergedWith(catalog: Instrument[]): Instrument[] {
    const extras = this.list().filter(
      (instrument) => !catalog.some((item) => item.id === instrument.id),
    );
    return [...catalog, ...extras];
  }

  clear(): void {
    this.write({ version: 1, instruments: [] });
  }

  private read(): DirectoryDocument {
    const raw = this.storage.getItem(this.key);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Partial<DirectoryDocument>;
        if (
          parsed.version === 1 &&
          Array.isArray(parsed.instruments) &&
          parsed.instruments.every(isInstrument)
        ) {
          return { version: 1, instruments: parsed.instruments };
        }
      } catch {
        // 损坏数据回退为空目录。
      }
    }
    return { version: 1, instruments: [] };
  }

  private write(document: DirectoryDocument): void {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}

let browserDirectory: LocalInstrumentDirectory | null = null;
/** 非浏览器环境（测试）使用内存回退。 */
let memoryDirectory: LocalInstrumentDirectory | null = null;

function memoryAdapter(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

export function getInstrumentDirectory(): LocalInstrumentDirectory {
  if (typeof window !== "undefined" && window.localStorage) {
    if (browserDirectory === null) {
      browserDirectory = new LocalInstrumentDirectory(window.localStorage);
    }
    return browserDirectory;
  }
  if (memoryDirectory === null) {
    memoryDirectory = new LocalInstrumentDirectory(memoryAdapter());
  }
  return memoryDirectory;
}

/** 合并一批标的元数据到目录（搜索命中、添加操作后调用）。 */
export function mergeInstruments(instruments: Instrument[]): void {
  if (instruments.length === 0) return;
  getInstrumentDirectory().merge(instruments);
}
