import type { PortfolioPosition, PortfolioPositionDraft } from "./types";

export interface PortfolioStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PortfolioRepository {
  list(): Promise<PortfolioPosition[]>;
  upsert(draft: PortfolioPositionDraft): Promise<PortfolioPosition>;
  remove(instrumentId: string): Promise<void>;
}

interface PortfolioDocument {
  version: 1;
  positions: PortfolioPosition[];
}

const STORAGE_KEY = "quantsift.portfolio.v1";

export class InvalidPortfolioPositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPortfolioPositionError";
  }
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validateDraft(draft: PortfolioPositionDraft) {
  if (!draft.instrumentId.trim()) {
    throw new InvalidPortfolioPositionError("持仓标的不能为空");
  }
  if (!isFinitePositive(draft.quantity)) {
    throw new InvalidPortfolioPositionError("持仓数量必须大于 0");
  }
  if (!isFinitePositive(draft.averageCost)) {
    throw new InvalidPortfolioPositionError("平均成本必须大于 0");
  }
  if (
    !isFinitePositive(draft.stopLossPct) ||
    draft.stopLossPct > 100 ||
    !isFinitePositive(draft.takeProfitPct) ||
    draft.takeProfitPct > 500
  ) {
    throw new InvalidPortfolioPositionError("止损或目标比例超出有效范围");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.openedAt)) {
    throw new InvalidPortfolioPositionError("建仓日期格式无效");
  }
}

function isPosition(value: unknown): value is PortfolioPosition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PortfolioPosition>;
  return (
    typeof item.instrumentId === "string" &&
    typeof item.quantity === "number" &&
    typeof item.averageCost === "number" &&
    typeof item.openedAt === "string" &&
    typeof item.stopLossPct === "number" &&
    typeof item.takeProfitPct === "number" &&
    typeof item.note === "string" &&
    typeof item.updatedAt === "string"
  );
}

export class LocalPortfolioRepository implements PortfolioRepository {
  constructor(
    private readonly storage: PortfolioStorageAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly key = STORAGE_KEY,
  ) {}

  async list(): Promise<PortfolioPosition[]> {
    return this.read().positions;
  }

  async upsert(draft: PortfolioPositionDraft): Promise<PortfolioPosition> {
    validateDraft(draft);
    const document = this.read();
    const position: PortfolioPosition = {
      ...draft,
      instrumentId: draft.instrumentId.trim(),
      quantity: Number(draft.quantity),
      averageCost: Number(draft.averageCost),
      stopLossPct: Number(draft.stopLossPct),
      takeProfitPct: Number(draft.takeProfitPct),
      note: draft.note.trim(),
      updatedAt: this.now().toISOString(),
    };
    const index = document.positions.findIndex(
      (item) => item.instrumentId === position.instrumentId,
    );
    if (index === -1) document.positions.push(position);
    else document.positions[index] = position;
    this.write(document);
    return position;
  }

  async remove(instrumentId: string): Promise<void> {
    const document = this.read();
    document.positions = document.positions.filter(
      (item) => item.instrumentId !== instrumentId,
    );
    this.write(document);
  }

  private read(): PortfolioDocument {
    const raw = this.storage.getItem(this.key);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Partial<PortfolioDocument>;
        if (
          parsed.version === 1 &&
          Array.isArray(parsed.positions) &&
          parsed.positions.every(isPosition)
        ) {
          return { version: 1, positions: parsed.positions };
        }
      } catch {
        // A later write repairs invalid local data.
      }
    }
    return { version: 1, positions: [] };
  }

  private write(document: PortfolioDocument) {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}
