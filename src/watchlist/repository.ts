export interface WatchlistEntry {
  instrumentId: string;
  note: string;
  tags: string[];
  enabled: boolean;
  addedAt: string;
}

export interface WatchlistUpdate {
  note?: string;
  tags?: string[];
  enabled?: boolean;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WatchlistRepository {
  list(): Promise<WatchlistEntry[]>;
  seedIfMissing(instrumentIds: string[]): Promise<void>;
  applyMigration(migrationId: string, instrumentIds: string[]): Promise<void>;
  add(instrumentId: string): Promise<WatchlistEntry>;
  update(instrumentId: string, update: WatchlistUpdate): Promise<WatchlistEntry>;
  remove(instrumentId: string): Promise<void>;
}

interface WatchlistDocument {
  version: 2;
  entries: WatchlistEntry[];
  appliedMigrations: string[];
}

interface LegacyWatchlistDocument {
  version: 1;
  entries: WatchlistEntry[];
}

const STORAGE_KEY = "quantsift.watchlist.v1";

export class WatchlistDuplicateError extends Error {
  constructor(instrumentId: string) {
    super(`${instrumentId} 已在观察列表中`);
    this.name = "WatchlistDuplicateError";
  }
}

export class WatchlistEntryNotFoundError extends Error {
  constructor(instrumentId: string) {
    super(`观察列表中不存在 ${instrumentId}`);
    this.name = "WatchlistEntryNotFoundError";
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 6);
}

function isWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<WatchlistEntry>;
  return (
    typeof entry.instrumentId === "string" &&
    typeof entry.note === "string" &&
    Array.isArray(entry.tags) &&
    entry.tags.every((tag) => typeof tag === "string") &&
    typeof entry.enabled === "boolean" &&
    typeof entry.addedAt === "string"
  );
}

export class LocalWatchlistRepository implements WatchlistRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly key = STORAGE_KEY,
  ) {}

  async list(): Promise<WatchlistEntry[]> {
    return this.read().entries;
  }

  async seedIfMissing(instrumentIds: string[]): Promise<void> {
    if (this.storage.getItem(this.key) !== null) return;
    const addedAt = this.now().toISOString();
    this.write({
      version: 2,
      entries: instrumentIds.map((instrumentId) => ({
        instrumentId,
        note: "",
        tags: ["示例"],
        enabled: true,
        addedAt,
      })),
      appliedMigrations: [],
    });
  }

  async applyMigration(
    migrationId: string,
    instrumentIds: string[],
  ): Promise<void> {
    const document = this.read();
    if (document.appliedMigrations.includes(migrationId)) return;

    const existingIds = new Set(document.entries.map((entry) => entry.instrumentId));
    const addedAt = this.now().toISOString();
    for (const instrumentId of instrumentIds) {
      if (existingIds.has(instrumentId)) continue;
      document.entries.push({
        instrumentId,
        note: "人工智能主题基金，等待回踩确认",
        tags: ["重点监控", "AI主题"],
        enabled: true,
        addedAt,
      });
    }
    document.appliedMigrations.push(migrationId);
    this.write(document);
  }

  async add(instrumentId: string): Promise<WatchlistEntry> {
    const document = this.read();
    if (document.entries.some((entry) => entry.instrumentId === instrumentId)) {
      throw new WatchlistDuplicateError(instrumentId);
    }
    const entry: WatchlistEntry = {
      instrumentId,
      note: "",
      tags: [],
      enabled: true,
      addedAt: this.now().toISOString(),
    };
    document.entries.push(entry);
    this.write(document);
    return entry;
  }

  async update(
    instrumentId: string,
    update: WatchlistUpdate,
  ): Promise<WatchlistEntry> {
    const document = this.read();
    const index = document.entries.findIndex(
      (entry) => entry.instrumentId === instrumentId,
    );
    if (index === -1) throw new WatchlistEntryNotFoundError(instrumentId);

    const current = document.entries[index];
    const next: WatchlistEntry = {
      ...current,
      note: update.note === undefined ? current.note : update.note.trim(),
      tags: update.tags === undefined ? current.tags : normalizeTags(update.tags),
      enabled: update.enabled ?? current.enabled,
    };
    document.entries[index] = next;
    this.write(document);
    return next;
  }

  async remove(instrumentId: string): Promise<void> {
    const document = this.read();
    document.entries = document.entries.filter(
      (entry) => entry.instrumentId !== instrumentId,
    );
    this.write(document);
  }

  private read(): WatchlistDocument {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return { version: 2, entries: [], appliedMigrations: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<WatchlistDocument> | Partial<LegacyWatchlistDocument>;
      if (
        Array.isArray(parsed.entries) &&
        parsed.entries.every(isWatchlistEntry)
      ) {
        if (parsed.version === 2) {
          return {
            version: 2,
            entries: parsed.entries,
            appliedMigrations: Array.isArray((parsed as Partial<WatchlistDocument>).appliedMigrations)
              ? (parsed as Partial<WatchlistDocument>).appliedMigrations!.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
          };
        }
        if (parsed.version === 1) {
          return { version: 2, entries: parsed.entries, appliedMigrations: [] };
        }
      }
    } catch {
      // Fall through to a safe empty document; the next mutation repairs it.
    }
    return { version: 2, entries: [], appliedMigrations: [] };
  }

  private write(document: WatchlistDocument) {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}

