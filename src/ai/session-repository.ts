import type { AnalysisSession } from "./types";

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AnalysisSessionStore {
  list(): Promise<AnalysisSession[]>;
  listByInstrument(instrumentId: string): Promise<AnalysisSession[]>;
  save(session: AnalysisSession): Promise<void>;
  clear(): Promise<void>;
}

interface SessionDocument {
  version: 1;
  sessions: AnalysisSession[];
}

const STORAGE_KEY = "quantsift.analysis-sessions.v1";
const MAX_SESSIONS = 500;

function isAnalysisSession(value: unknown): value is AnalysisSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AnalysisSession>;
  return (
    typeof session.id === "string" &&
    typeof session.instrumentId === "string" &&
    typeof session.createdAt === "string" &&
    typeof session.asOfDate === "string" &&
    typeof session.advice === "object" &&
    session.advice !== null &&
    Array.isArray(session.providers) &&
    Array.isArray(session.messages)
  );
}

/**
 * 分析会话的本地留存：版本化文档、损坏安全回退、容量上限。
 * 会话（含网络研究结果与随机因子种子）全部保存在当前设备。
 */
export class LocalAnalysisSessionRepository implements AnalysisSessionStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key = STORAGE_KEY,
  ) {}

  async list(): Promise<AnalysisSession[]> {
    return this.read().sessions;
  }

  async listByInstrument(instrumentId: string): Promise<AnalysisSession[]> {
    return this.read()
      .sessions.filter((session) => session.instrumentId === instrumentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(session: AnalysisSession): Promise<void> {
    const document = this.read();
    document.sessions = [
      session,
      ...document.sessions.filter((candidate) => candidate.id !== session.id),
    ].slice(0, MAX_SESSIONS);
    this.write(document);
  }

  async clear(): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify({ version: 1, sessions: [] }));
  }

  private read(): SessionDocument {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return { version: 1, sessions: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<SessionDocument>;
      if (
        parsed.version === 1 &&
        Array.isArray(parsed.sessions)
      ) {
        return {
          version: 1,
          sessions: parsed.sessions
            .filter(isAnalysisSession)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        };
      }
    } catch {
      // 损坏数据回退为空文档，下次保存时修复。
    }
    return { version: 1, sessions: [] };
  }

  private write(document: SessionDocument): void {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}

export type TimeDimension = "today" | "week" | "month" | "all";

/** 按时间维度过滤会话：今日 / 本周 / 本月 / 全部。 */
export function filterSessionsByDimension(
  sessions: AnalysisSession[],
  dimension: TimeDimension,
  now: Date = new Date(),
): AnalysisSession[] {
  if (dimension === "all") return sessions;
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  let start: Date;
  if (dimension === "today") {
    start = startOfDay;
  } else if (dimension === "week") {
    const day = (now.getDay() + 6) % 7; // 周一为一周起点
    start = new Date(startOfDay);
    start.setDate(start.getDate() - day);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return sessions.filter(
    (session) => new Date(session.createdAt).getTime() >= start.getTime(),
  );
}
