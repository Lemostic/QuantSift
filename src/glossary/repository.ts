import type { GlossaryDocument, GlossaryTerm } from "./types";

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GlossaryStore {
  getTerms(): Promise<GlossaryTerm[]>;
  /** 合并一批新词条（同 id 覆盖，新 id 追加）。 */
  merge(terms: GlossaryTerm[], updatedAt: string): Promise<void>;
  /** 记录最近一次网络更新的时间。 */
  getUpdatedAt(): Promise<string | null>;
}

const STORAGE_KEY = "quantsift.glossary.v1";

function buildDocument(terms: GlossaryTerm[], updatedAt: string | null): GlossaryDocument {
  return { version: 1, updatedAt, terms };
}

/**
 * 术语手册本地留存：内置词条始终可用，网络更新结果合并进本地文档。
 * 损坏数据回退为内置词条。
 */
export class LocalGlossaryRepository implements GlossaryStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly builtin: GlossaryTerm[],
    private readonly key = STORAGE_KEY,
  ) {}

  async getTerms(): Promise<GlossaryTerm[]> {
    return this.read().terms;
  }

  async merge(terms: GlossaryTerm[], updatedAt: string): Promise<void> {
    const document = this.read();
    const byId = new Map(document.terms.map((term) => [term.id, term]));
    for (const term of terms) {
      byId.set(term.id, { ...term, source: "web", updatedAt });
    }
    this.write(
      buildDocument(
        [...byId.values()].sort((a, b) => a.term.localeCompare(b.term, "zh")),
        updatedAt,
      ),
    );
  }

  async getUpdatedAt(): Promise<string | null> {
    return this.read().updatedAt;
  }

  private read(): GlossaryDocument {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return buildDocument(this.builtin, null);
    try {
      const parsed = JSON.parse(raw) as Partial<GlossaryDocument>;
      if (parsed.version === 1 && Array.isArray(parsed.terms)) {
        return {
          version: 1,
          updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
          terms: parsed.terms.filter(isGlossaryTerm),
        };
      }
    } catch {
      // 损坏数据回退为内置词条。
    }
    return buildDocument(this.builtin, null);
  }

  private write(document: GlossaryDocument): void {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}

function isGlossaryTerm(value: unknown): value is GlossaryTerm {
  if (!value || typeof value !== "object") return false;
  const term = value as Partial<GlossaryTerm>;
  return (
    typeof term.id === "string" &&
    typeof term.term === "string" &&
    typeof term.category === "string" &&
    typeof term.summary === "string" &&
    typeof term.detail === "string"
  );
}

export interface RemoteGlossarySource {
  /** 返回远程词条 JSON（数组），失败抛错。 */
  fetch(): Promise<GlossaryTerm[]>;
}

export const DEFAULT_GLOSSARY_URL =
  "https://raw.githubusercontent.com/Lemostic/QuantSift/dev/docs/glossary.json";

/** 基于 fetch 的远程词条源（raw.githubusercontent 允许跨域）。 */
export function createHttpGlossarySource(
  url: string = DEFAULT_GLOSSARY_URL,
): RemoteGlossarySource {
  return {
    async fetch() {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`手册下载失败: HTTP ${response.status}`);
      }
      const parsed = (await response.json()) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("手册格式错误：应为词条数组");
      }
      const terms = parsed.filter(isGlossaryTerm);
      if (terms.length === 0) {
        throw new Error("手册为空或格式不合法");
      }
      return terms;
    },
  };
}

export interface UpdateGlossaryRequest {
  store: GlossaryStore;
  source: RemoteGlossarySource;
  now?: () => Date;
}

/** 拉取远程手册并合并进本地，返回合并后的词条数与更新时间。 */
export async function updateGlossary(
  request: UpdateGlossaryRequest,
): Promise<{ count: number; updatedAt: string }> {
  const terms = await request.source.fetch();
  const now = request.now ?? (() => new Date());
  const updatedAt = now().toISOString();
  await request.store.merge(terms, updatedAt);
  return { count: terms.length, updatedAt };
}
